-- Per-token prices from when the API resold tokens. Nothing reads them since 0006 (customers
-- pay per unit, app.service_prices); what tokens cost us stays in app.model_costs.
DROP TABLE "app"."model_rates" CASCADE;
