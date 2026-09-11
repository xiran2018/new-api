package helper

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
)

func BuildImageBillingExprRequestInput(request *dto.ImageRequest, headers map[string]string) (billingexpr.RequestInput, error) {
	input, err := BuildBillingExprRequestInputFromRequest(request, headers)
	if err != nil || request == nil {
		return input, err
	}
	count := 1
	if request.N != nil && *request.N > 0 {
		count = int(*request.N)
	}
	inputImages := countJSONImages(request.Image) + countJSONImages(request.Images)
	size := strings.TrimSpace(request.Size)
	if size == "" {
		for _, key := range []string{"size", "resolution", "output_resolution"} {
			if raw, ok := request.Extra[key]; ok {
				_ = json.Unmarshal(raw, &size)
				if strings.TrimSpace(size) != "" {
					break
				}
			}
		}
	}
	if size == "" {
		if raw, ok := request.Extra["parameters"]; ok {
			var parameters map[string]any
			if json.Unmarshal(raw, &parameters) == nil {
				for _, key := range []string{"size", "resolution", "output_resolution"} {
					if value, ok := parameters[key]; ok {
						size = strings.TrimSpace(fmt.Sprint(value))
						if size != "" {
							break
						}
					}
				}
			}
		}
	}
	resolution := normalizeImageResolution(size)
	input.Usage = map[string]any{
		"resolution":      resolution,
		"resolution_tier": imageResolutionTier(resolution),
		"input_images":    float64(inputImages),
		"output_images":   float64(count),
		"count":           float64(count),
		"characters":      float64(utf8.RuneCountInString(request.Prompt)),
	}
	if strings.TrimSpace(request.Quality) != "" {
		input.Usage["quality"] = strings.TrimSpace(request.Quality)
	}
	addImageUsageScalars(input.Usage, "", request.Extra)
	return input, nil
}

// UpdateImageBillingUsageCount replaces the request estimate with the actual
// number of images returned by the upstream before tiered settlement.
func UpdateImageBillingUsageCount(info *relaycommon.RelayInfo, count int64) {
	if info == nil || info.BillingRequestInput == nil || count <= 0 || count > int64(dto.MaxImageN) {
		return
	}
	if info.BillingRequestInput.Usage == nil {
		info.BillingRequestInput.Usage = make(map[string]any)
	}
	actual := float64(count)
	info.BillingRequestInput.Usage["output_images"] = actual
	info.BillingRequestInput.Usage["count"] = actual
}

func addImageUsageScalars(usage map[string]any, prefix string, values map[string]json.RawMessage) {
	for key, raw := range values {
		name := key
		if prefix != "" {
			name = prefix + "." + key
		}
		var value any
		if json.Unmarshal(raw, &value) != nil {
			continue
		}
		switch typed := value.(type) {
		case string, bool, float64:
			usage[name] = typed
			// Top-level aliases make common vendor parameters easier to configure.
			if prefix == "parameters" {
				if _, exists := usage[key]; !exists {
					usage[key] = typed
				}
			}
		case map[string]any:
			encoded := make(map[string]json.RawMessage, len(typed))
			for childKey, childValue := range typed {
				childRaw, err := json.Marshal(childValue)
				if err == nil {
					encoded[childKey] = childRaw
				}
			}
			addImageUsageScalars(usage, name, encoded)
		}
	}
}

func countJSONImages(raw json.RawMessage) int {
	if len(raw) == 0 || string(raw) == "null" || string(raw) == `""` {
		return 0
	}
	var values []any
	if json.Unmarshal(raw, &values) == nil {
		return len(values)
	}
	return 1
}

func normalizeImageResolution(size string) string {
	normalized := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(size), "*", "X"))
	return normalized
}

func imageResolutionTier(normalized string) string {
	if strings.Contains(normalized, "4K") {
		return "4K"
	}
	if strings.Contains(normalized, "2K") {
		return "2K"
	}
	parts := strings.Split(normalized, "X")
	if len(parts) == 2 {
		width, widthErr := strconv.Atoi(strings.TrimSpace(parts[0]))
		height, heightErr := strconv.Atoi(strings.TrimSpace(parts[1]))
		if widthErr == nil && heightErr == nil && (width > 2560 || height > 2560) {
			return "4K"
		}
		if widthErr == nil && heightErr == nil && (width > 1536 || height > 1536) {
			return "2K"
		}
	}
	return "1K"
}

func ResolveIncomingBillingExprRequestInput(c *gin.Context, info *relaycommon.RelayInfo) (billingexpr.RequestInput, error) {
	if info != nil && info.BillingRequestInput != nil {
		input := cloneRequestInput(*info.BillingRequestInput)
		merged := cloneStringMap(info.RequestHeaders)
		for k, v := range input.Headers {
			merged[k] = v
		}
		input.Headers = merged
		return input, nil
	}

	input := billingexpr.RequestInput{}
	if info != nil {
		input.Headers = cloneStringMap(info.RequestHeaders)
	}

	bodyBytes, err := readIncomingBillingExprBody(c)
	if err != nil {
		return billingexpr.RequestInput{}, err
	}
	input.Body = bodyBytes
	return input, nil
}

func BuildBillingExprRequestInputFromRequest(request dto.Request, headers map[string]string) (billingexpr.RequestInput, error) {
	input := billingexpr.RequestInput{
		Headers: cloneStringMap(headers),
	}
	if request == nil {
		return input, nil
	}

	bodyBytes, err := common.Marshal(request)
	if err != nil {
		return billingexpr.RequestInput{}, err
	}
	input.Body = bodyBytes
	return input, nil
}

func readIncomingBillingExprBody(c *gin.Context) ([]byte, error) {
	if c == nil || c.Request == nil || !isJSONContentType(c.Request.Header.Get("Content-Type")) {
		return nil, nil
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, err
	}
	return storage.Bytes()
}

func cloneRequestInput(src billingexpr.RequestInput) billingexpr.RequestInput {
	input := billingexpr.RequestInput{
		Headers: cloneStringMap(src.Headers),
		Usage:   cloneUsageMap(src.Usage),
	}
	if len(src.Body) > 0 {
		input.Body = append([]byte(nil), src.Body...)
	}
	return input
}

func cloneUsageMap(src map[string]any) map[string]any {
	if len(src) == 0 {
		return nil
	}
	dst := make(map[string]any, len(src))
	for key, value := range src {
		dst[key] = value
	}
	return dst
}

func isJSONContentType(contentType string) bool {
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	return strings.HasPrefix(contentType, "application/json")
}

func cloneStringMap(src map[string]string) map[string]string {
	if len(src) == 0 {
		return map[string]string{}
	}
	dst := make(map[string]string, len(src))
	for key, value := range src {
		if strings.TrimSpace(key) == "" {
			continue
		}
		dst[key] = value
	}
	return dst
}
