package helper

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestBuildImageBillingExprRequestInput(t *testing.T) {
	n := uint(2)
	request := &dto.ImageRequest{
		Model:  "qwen-image-3.0-pro",
		N:      &n,
		Images: json.RawMessage(`["first","second"]`),
		Extra: map[string]json.RawMessage{
			"parameters": json.RawMessage(`{"size":"2048*2048","audio":true,"mode":"wan-pro"}`),
		},
	}
	input, err := BuildImageBillingExprRequestInput(request, nil)
	require.NoError(t, err)
	require.Equal(t, "2048X2048", input.Usage["resolution"])
	require.Equal(t, "2K", input.Usage["resolution_tier"])
	require.Equal(t, float64(2), input.Usage["input_images"])
	require.Equal(t, float64(2), input.Usage["output_images"])
	require.Equal(t, true, input.Usage["audio"])
	require.Equal(t, "wan-pro", input.Usage["mode"])
}

func TestBuildImageBillingExprRequestInputDefaults(t *testing.T) {
	input, err := BuildImageBillingExprRequestInput(&dto.ImageRequest{
		Model: "qwen-image-3.0",
		Size:  "1024x1024",
	}, nil)
	require.NoError(t, err)
	require.Equal(t, "1024X1024", input.Usage["resolution"])
	require.Equal(t, "1K", input.Usage["resolution_tier"])
	require.Equal(t, float64(0), input.Usage["input_images"])
	require.Equal(t, float64(1), input.Usage["output_images"])
}

func TestResolveIncomingBillingExprRequestInput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Request.Header.Set("Content-Type", "application/json")

	body := []byte(`{"service_tier":"fast"}`)
	ctx.Request.Body = io.NopCloser(bytes.NewReader(body))
	ctx.Set(common.KeyRequestBody, body)

	info := &relaycommon.RelayInfo{
		RequestHeaders: map[string]string{"Content-Type": "application/json"},
	}

	input, err := ResolveIncomingBillingExprRequestInput(ctx, info)
	require.NoError(t, err)
	require.Equal(t, body, input.Body)
	require.Equal(t, "application/json", input.Headers["Content-Type"])
}

func TestBuildBillingExprRequestInputFromRequest(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Model:  "gemini-3.1-pro-preview",
		Stream: lo.ToPtr(true),
		Messages: []dto.Message{
			{
				Role:    "user",
				Content: "hi",
			},
		},
		MaxTokens: lo.ToPtr(uint(3000)),
	}

	input, err := BuildBillingExprRequestInputFromRequest(request, map[string]string{
		"Content-Type": "application/json",
		"X-Test":       "1",
	})
	require.NoError(t, err)
	require.Equal(t, "application/json", input.Headers["Content-Type"])
	require.Equal(t, "1", input.Headers["X-Test"])
	require.True(t, gjson.GetBytes(input.Body, "stream").Bool())
	require.Equal(t, "user", gjson.GetBytes(input.Body, "messages.0.role").String())
	require.Equal(t, float64(3000), gjson.GetBytes(input.Body, "max_tokens").Float())
}

func TestResolveIncomingBillingExprRequestInputKeepsUsageFacts(t *testing.T) {
	info := &relaycommon.RelayInfo{BillingRequestInput: &billingexpr.RequestInput{
		Usage: map[string]any{"resolution": "2K", "output_images": float64(2)},
	}}
	input, err := ResolveIncomingBillingExprRequestInput(nil, info)
	require.NoError(t, err)
	require.Equal(t, "2K", input.Usage["resolution"])
	require.Equal(t, float64(2), input.Usage["output_images"])
}

func TestUpdateImageBillingUsageCountUsesActualOutput(t *testing.T) {
	info := &relaycommon.RelayInfo{BillingRequestInput: &billingexpr.RequestInput{
		Usage: map[string]any{"output_images": float64(2), "count": float64(2)},
	}}
	UpdateImageBillingUsageCount(info, 5)
	require.Equal(t, float64(5), info.BillingRequestInput.Usage["output_images"])
	require.Equal(t, float64(5), info.BillingRequestInput.Usage["count"])
}
