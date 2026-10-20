package xai

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertImageRequestPreservesSupportedXAIFields(t *testing.T) {
	n := uint(2)
	request := dto.ImageRequest{
		Model:          "grok-imagine-image-2.0",
		Prompt:         "a lighthouse at dusk",
		N:              &n,
		Quality:        "medium",
		ResponseFormat: "url",
		Image:          json.RawMessage(`"https://example.com/reference.png"`),
		Images:         json.RawMessage(`["https://example.com/one.png","https://example.com/two.png"]`),
		Extra: map[string]json.RawMessage{
			"resolution":   json.RawMessage(`"1.5k"`),
			"aspect_ratio": json.RawMessage(`"16:9"`),
			"unsupported":  json.RawMessage(`"must-not-leak"`),
		},
	}

	convertedValue, err := (&Adaptor{}).ConvertImageRequest(nil, nil, request)
	require.NoError(t, err)
	converted, ok := convertedValue.(ImageRequest)
	require.True(t, ok)

	assert.Equal(t, request.Model, converted.Model)
	assert.Equal(t, request.Prompt, converted.Prompt)
	assert.Equal(t, 2, converted.N)
	assert.Equal(t, request.Quality, converted.Quality)
	assert.Equal(t, request.ResponseFormat, converted.ResponseFormat)
	assert.JSONEq(t, string(request.Image), string(converted.Image))
	assert.JSONEq(t, string(request.Images), string(converted.Images))
	assert.JSONEq(t, `"1.5k"`, string(converted.Resolution))
	assert.JSONEq(t, `"16:9"`, string(converted.AspectRatio))

	encoded, err := json.Marshal(converted)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "unsupported")
	assert.NotContains(t, string(encoded), "must-not-leak")
}

func TestConvertImageRequestDefaultsCountToOne(t *testing.T) {
	convertedValue, err := (&Adaptor{}).ConvertImageRequest(nil, nil, dto.ImageRequest{})
	require.NoError(t, err)
	converted, ok := convertedValue.(ImageRequest)
	require.True(t, ok)
	assert.Equal(t, 1, converted.N)
}
