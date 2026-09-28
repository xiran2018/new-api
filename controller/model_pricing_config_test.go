package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestUpdateModelPricingConfigAcceptsRealtimeSessionDuration(t *testing.T) {
	modelManagementDB(t, "sqlite", "")

	const modelName = "gpt-live-1"
	const expression = `tier("GPT-Live session connection duration", u("live_session_seconds") * (0.05 * 1000000 / 60))`
	snapshot, err := model.GetModelPricingSnapshot([]string{modelName})
	require.NoError(t, err)
	require.Len(t, snapshot.Entries, 1)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	modelManagementRequest(t, UpdateModelPricingConfig, http.MethodPatch, "/api/option/model_pricing", map[string]any{
		"changes": []model.ModelPricingChange{{
			ModelName:       modelName,
			ExpectedVersion: snapshot.Entries[0].Version,
			Pricing: model.PricingValues{
				"billing_setting.billing_mode": "tiered_expr",
				"billing_setting.billing_expr": expression,
			},
		}},
	}, &response)
	require.True(t, response.Success, response.Message)

	saved, err := model.GetModelPricingSnapshot([]string{modelName})
	require.NoError(t, err)
	require.Equal(t, expression, saved.Entries[0].Configured["billing_setting.billing_expr"])
}
