-- The API stops reselling tokens and sells a service: content moderation, priced per item.
-- The ledger keeps the token counts (what each call cost us) and gains what was sold (units).
CREATE TABLE "app"."service_prices" (
	"service" text PRIMARY KEY NOT NULL,
	"unit_price_micros" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_prices_unit_price_check" CHECK ("app"."service_prices"."unit_price_micros" >= 0)
);
--> statement-breakpoint
-- Every call recorded so far was a chat completion billed per token: label those rows, then
-- make new rows say what they sold.
ALTER TABLE "app"."usage_events" ADD COLUMN "service" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."usage_events" ALTER COLUMN "service" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app"."usage_events" ADD COLUMN "units" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- What we CHARGE is now units × the service's unit price (no more per-token rates). Past rows
-- keep the price_micros they were written with.
DROP FUNCTION IF EXISTS app.price_micros(text, bigint, bigint, bigint, bigint);--> statement-breakpoint
CREATE FUNCTION app.price_micros(p_service text, p_units bigint) RETURNS bigint
LANGUAGE sql STABLE AS $$
  select coalesce((
    select greatest(p_units, 0) * p.unit_price_micros
      from app.service_prices p
     where p.service = p_service
  ), 0)
$$;--> statement-breakpoint

-- Launch price: $1 per 1,000 items (1,000 micros per unit of up to 2,000 characters). One item
-- costs us about 70 micros in tokens on gpt-oss-20b alone, under 40 each in a batch of eight.
INSERT INTO "app"."service_prices" ("service", "unit_price_micros") VALUES ('moderate', 1000);--> statement-breakpoint

-- The wallet again (same columns, so the view is replaced in place): the simulated-spend comment
-- now says what the app sells. Otherwise unchanged from 0005.
CREATE OR REPLACE VIEW app.balances AS
  with purchased as (
    select a.id as account_id, sum((ch.amount - ch.amount_refunded) * 10000)::bigint as micros
      from app.accounts a
      join stripe.charges ch on ch.customer = a.stripe_customer_id
     where ch.status = 'succeeded'
       and ch.paid
       and not ch.disputed
       and ch.currency = 'usd'
     group by a.id
  ),
  free_orders as (
    select a.id as account_id, sum(coalesce(cs.metadata ->> 'credits_cents', '0')::bigint * 10000)::bigint as micros
      from app.accounts a
      join stripe.checkout_sessions cs on cs.customer = a.stripe_customer_id
     where cs.mode = 'payment'
       and cs.status = 'complete'
       and cs.payment_status in ('paid', 'no_payment_required')
       and cs.amount_total = 0
     group by a.id
  ),
  free_invoices as (
    select a.id as account_id, sum(coalesce(inv.metadata ->> 'credits_cents', '0')::bigint * 10000)::bigint as micros
      from app.accounts a
      join stripe.invoices inv on inv.customer = a.stripe_customer_id
     where inv.status = 'paid'
       and inv.total = 0
       and inv.metadata ->> 'app' = 'bouncer'
     group by a.id
  ),
  spent as (
    select account_id, sum(micros)::bigint as micros
      from (
        select u.account_id, u.price_micros as micros from app.usage_events u
        union all
        -- Simulated usage (dashboard demo): spends credits with no moderation behind it.
        select d.account_id, d.amount_micros from app.simulated_spend d
      ) all_spend
     group by account_id
  )
  select a.id as account_id,
         (coalesce(p.micros, 0) + coalesce(f.micros, 0) + coalesce(i.micros, 0))::bigint as purchased_micros,
         coalesce(s.micros, 0)::bigint as spent_micros,
         (coalesce(p.micros, 0) + coalesce(f.micros, 0) + coalesce(i.micros, 0) - coalesce(s.micros, 0))::bigint as balance_micros
    from app.accounts a
    left join purchased p on p.account_id = a.id
    left join free_orders f on f.account_id = a.id
    left join free_invoices i on i.account_id = a.id
    left join spent s on s.account_id = a.id;
