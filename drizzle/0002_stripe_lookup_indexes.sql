-- Lookup indexes on Stripe-synced tables. The pipeline only creates primary keys
-- (id, _account_id) and _updated_at indexes, so per-customer reads would be sequential scans.
-- These change no data, so the sync keeps writing as before. If the pipeline ever recreates a
-- table (e.g. a full resync), re-run these statements.

-- Wallet view, card on file, purchase history, auto top-ups: a customer's charges, newest first.
CREATE INDEX IF NOT EXISTS "bouncer_charges_customer_created_idx" ON "stripe"."charges" USING btree ("customer", "created");--> statement-breakpoint
-- Wallet view + purchase history: a customer's free ($0) Checkout Sessions and top-up invoices.
CREATE INDEX IF NOT EXISTS "bouncer_checkout_sessions_customer_created_idx" ON "stripe"."checkout_sessions" USING btree ("customer", "created");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bouncer_invoices_customer_created_idx" ON "stripe"."invoices" USING btree ("customer", "created");--> statement-breakpoint
-- /api/checkout and the topups function: promotion code by code.
CREATE INDEX IF NOT EXISTS "bouncer_promotion_codes_code_idx" ON "stripe"."promotion_codes" USING btree ("code");--> statement-breakpoint
-- /api/checkout: price by lookup key.
CREATE INDEX IF NOT EXISTS "bouncer_prices_lookup_key_idx" ON "stripe"."prices" USING btree ("lookup_key");
