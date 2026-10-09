-- Pricing formulas, the wallet and the rate-impact view. Custom SQL: drizzle-kit can't express
-- functions, and these views read the Stripe-synced tables (connect the pipeline first).
-- Rates are USD per million tokens, so tokens × rate = micro-dollars exactly.

-- What we CHARGE for one call (or for a sum of calls: the formula is linear). Reasoning
-- tokens are part of the output tokens but have their own rate.
CREATE FUNCTION app.price_micros(p_model text, p_input bigint, p_cached bigint, p_output bigint, p_reasoning bigint) RETURNS bigint
LANGUAGE sql STABLE AS $$
  select coalesce((
    select round(
             greatest(p_input - p_cached, 0) * r.input_usd_per_mtok
           + p_cached * r.cached_input_usd_per_mtok
           + greatest(p_output - p_reasoning, 0) * r.output_usd_per_mtok
           + p_reasoning * r.reasoning_usd_per_mtok
           )::bigint
      from app.model_rates r
     where r.model = p_model
  ), 0)
$$;--> statement-breakpoint

-- What AI Gateway charges US for the same call. Providers bill reasoning as output.
CREATE FUNCTION app.cost_micros(p_model text, p_input bigint, p_cached bigint, p_output bigint) RETURNS bigint
LANGUAGE sql STABLE AS $$
  select coalesce((
    select round(
             greatest(p_input - p_cached, 0) * c.input_usd_per_mtok
           + p_cached * c.cached_input_usd_per_mtok
           + p_output * c.output_usd_per_mtok
           )::bigint
      from app.model_costs c
     where c.model = p_model
  ), 0)
$$;--> statement-breakpoint

-- The wallet: purchased − spent (the usage ledger). No balance column, no webhook.
-- Purchased has three sources, so every way money (or a free order) reaches Stripe counts once:
--   paid charges   succeeded, undisputed, pro-rated for refunds (1 cent = 10,000 micros)
--   free checkouts completed $0 Checkout Sessions (100% promotion code): no charge exists, so
--                  the pack's face value is read from metadata.credits_cents
--   free invoices  paid $0 auto top-up invoices (same promotion code), same metadata
-- A paid order always has a charge and a total above 0, so nothing is counted twice.
CREATE VIEW app.balances AS
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
    select u.account_id, sum(u.price_micros)::bigint as micros
      from app.usage_events u
     group by u.account_id
  )
  select a.id as account_id,
         (coalesce(p.micros, 0) + coalesce(f.micros, 0) + coalesce(i.micros, 0))::bigint as purchased_micros,
         coalesce(s.micros, 0)::bigint as spent_micros,
         (coalesce(p.micros, 0) + coalesce(f.micros, 0) + coalesce(i.micros, 0) - coalesce(s.micros, 0))::bigint as balance_micros
    from app.accounts a
    left join purchased p on p.account_id = a.id
    left join free_orders f on f.account_id = a.id
    left join free_invoices i on i.account_id = a.id
    left join spent s on s.account_id = a.id;--> statement-breakpoint

-- Last 30 days per account and model. `charged_micros` is what the ledger recorded at the time;
-- `repriced_micros` is the same tokens at the rates in app.model_rates RIGHT NOW. On main they
-- match. On a pricing-lab branch, change the rates and this view shows what would have been.
CREATE VIEW app.rate_impact_30d AS
  with usage as (
    select u.account_id, u.model,
           count(*)::int as requests,
           sum(u.input_tokens)::bigint as input_tokens,
           sum(u.cached_input_tokens)::bigint as cached_input_tokens,
           sum(u.output_tokens)::bigint as output_tokens,
           sum(u.reasoning_tokens)::bigint as reasoning_tokens,
           sum(u.price_micros)::bigint as charged_micros,
           sum(u.cost_micros)::bigint as cost_micros
      from app.usage_events u
     where u.created_at > now() - interval '30 days'
     group by u.account_id, u.model
  )
  select usage.*,
         app.price_micros(model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens) as repriced_micros
    from usage;--> statement-breakpoint

-- AI Gateway list price for gpt-oss-20b, per million tokens (neon.com/docs/ai-gateway/models).
-- No cached-input price is published, so cached input is costed like input.
INSERT INTO app.model_costs (model, input_usd_per_mtok, cached_input_usd_per_mtok, output_usd_per_mtok)
VALUES ('gpt-oss-20b', 0.07, 0.07, 0.30);--> statement-breakpoint

-- Launch pricing: 3× cost on input and visible output. Reasoning tokens were priced at half of
-- what they cost us, to look cheap next to the big labs. Customers who turn reasoning up are
-- therefore served at a loss: the pricing lab is where that shows up, and gets fixed.
INSERT INTO app.model_rates (model, input_usd_per_mtok, cached_input_usd_per_mtok, output_usd_per_mtok, reasoning_usd_per_mtok)
VALUES ('gpt-oss-20b', 0.21, 0.21, 0.90, 0.15);
