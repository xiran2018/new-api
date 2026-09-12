package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateModelPricingAcceptsSynchronousMediaUsageRules(t *testing.T) {
	expression := `u("resolution") == "1080P" && u("audio") == true ? tier("1080P-audio", u("seconds") * 1000000) : tier("default", u("seconds") * 500000)`
	err := ValidateModelPricing("visual-media-model", PricingValues{
		"billing_setting.billing_mode": "tiered_expr",
		"billing_setting.billing_expr": expression,
	})
	require.NoError(t, err)
}

func TestValidateModelPricingRejectsUnknownSynchronousUsageMeter(t *testing.T) {
	err := ValidateModelPricing("visual-media-model", PricingValues{
		"billing_setting.billing_mode": "tiered_expr",
		"billing_setting.billing_expr": `tier("unknown", u("not_collected") * 1)`,
	})
	require.ErrorContains(t, err, "no task plugin usage schema")
}

func TestValidateModelPricingAcceptsTTSCharacterUsageRules(t *testing.T) {
	expression := `tier("tts", u("tts_input_characters") * 80 + u("tts_output_characters") * 20)`
	err := ValidateModelPricing("qwen3-tts-flash", PricingValues{
		"billing_setting.billing_mode": "tiered_expr",
		"billing_setting.billing_expr": expression,
	})
	require.NoError(t, err)
}
