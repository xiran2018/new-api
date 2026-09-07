import { createFileRoute } from "@tanstack/react-router";
import { ModelPricesPage } from "@/platform/public-pages/model-prices";
export const Route = createFileRoute("/model-prices/")({
  component: ModelPricesPage,
});
