CREATE TABLE "app"."simulated_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_micros" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulated_spend_amount_check" CHECK ("app"."simulated_spend"."amount_micros" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."simulated_spend" ADD CONSTRAINT "simulated_spend_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "simulated_spend_account_created_idx" ON "app"."simulated_spend" USING btree ("account_id","created_at");--> statement-breakpoint

-- The wallet now subtracts simulated usage too (same columns, so the view is replaced in place).
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
       and inv.metadata ->> 'app' = 'tollbooth'
     group by a.id
  ),
  spent as (
    select account_id, sum(micros)::bigint as micros
      from (
        select u.account_id, u.price_micros as micros from app.usage_events u
        union all
        -- Simulated usage (dashboard demo): spends credits with no AI Gateway call behind it.
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
