package xai

import (
	"encoding/json"

	"github.com/QuantumNous/new-api/relaykit/dto"
)

// ChatCompletionResponse represents the response from XAI chat completion API
type ChatCompletionResponse struct {
	Id                string                         `json:"id"`
	Object            string                         `json:"object"`
	Created           int64                          `json:"created"`
	Model             string                         `json:"model"`
	Choices           []dto.OpenAITextResponseChoice `json:"choices"`
	Usage             *dto.Usage                     `json:"usage"`
	SystemFingerprint string                         `json:"system_fingerprint"`
}

// ImageRequest contains only fields explicitly supported by xAI's image API.
// Keep provider-specific fields typed here instead of forwarding arbitrary
// ImageRequest.Extra values to the upstream API.
type ImageRequest struct {
	Model          string          `json:"model"`
	Prompt         string          `json:"prompt" binding:"required"`
	N              int             `json:"n,omitempty"`
	Quality        string          `json:"quality,omitempty"`
	ResponseFormat string          `json:"response_format,omitempty"`
	Image          json.RawMessage `json:"image,omitempty"`
	Images         json.RawMessage `json:"images,omitempty"`
	Resolution     json.RawMessage `json:"resolution,omitempty"`
	AspectRatio    json.RawMessage `json:"aspect_ratio,omitempty"`
}
