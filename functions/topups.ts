import { createCreditInvoice } from '@/shared/credit-invoice'
import { AUTO_PROMOTION_CODE, TOPUP_COOLDOWN_MINUTES } from '@/shared/pricing'
import { sql } from '@functions/lib/db'
import { env } from '@functions/lib/env'
import { parseTriggerDelivery } from '@neon/functions/triggers'
import { Hono } from 'hono'
import Stripe from 'stripe'

/**
 * Auto top-ups, every 5 minutes (schedule trigger in neon.ts), even while Postgres is scaled
 * to zero. No webhooks in either direction:
 *
 *   READ  from Postgres: accounts under their threshold (app.balances), the promotion code
 *         (stripe.promotion_codes) and, when purchases aren't free, the card from the latest
 *         synced charge.
 *   WRITE to Stripe's API: an invoice for the top-up amount. With the 100% code it's paid at $0
 *         on finalize; otherwise it's charged off-session to that card.
 *   The invoice (and any charge) syncs back within seconds and app.balances counts it.
 *
 * Safety: one top-up per account per cooldown window (app.topups + Stripe idempotency keys on
 * the same window). A failure (declined card, 3-D Secure needed, missing code) switches auto
 * top-up off with the reason instead of retrying forever.
 */
type Candidate = { account_id: string; customer: string; payment_method: string | null; amount_cents: number }

const app = new Hono()

app.post('/', async (c) => {
  const delivery = await parseTriggerDelivery(c.req.raw)
  if (!delivery.ok) return c.json({ error: delivery.error }, 401)
  if (delivery.invocation.trigger.type !== 'schedule') return c.json({ error: 'expected schedule' }, 400)
  if (!env.STRIPE_SECRET_KEY) return c.json({ error: 'STRIPE_SECRET_KEY is not set for this function' }, 500)
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: 'tollbooth' } })
  const free = AUTO_PROMOTION_CODE !== null

  const [promotion] = free ? ((await sql`select id from stripe.promotion_codes where code = ${AUTO_PROMOTION_CODE} and active order by created desc limit 1`) as { id: string }[]) : []
  const promotionCodeId = promotion?.id ?? null

  // Free top-ups need no card; paid ones need the card the customer last paid with.
  const candidates = (await sql`
    select a.id as account_id, a.stripe_customer_id as customer, card.payment_method, a.auto_topup_amount_cents as amount_cents
      from app.accounts a
      join app.balances b on b.account_id = a.id
      left join lateral (
        select ch.payment_method
          from stripe.charges ch
         where ch.customer = a.stripe_customer_id
           and ch.status = 'succeeded'
           and ch.payment_method is not null
         order by ch.created desc
         limit 1
      ) card on true
     where a.auto_topup_enabled
       and a.stripe_customer_id is not null
       and b.balance_micros < a.auto_topup_threshold_micros
       and (${free} or card.payment_method is not null)
       and not exists (
         select 1 from app.topups t
          where t.account_id = a.id
            and t.created_at > now() - make_interval(mins => ${TOPUP_COOLDOWN_MINUTES})
       )`) as Candidate[]

  const window = Math.floor(Date.now() / (TOPUP_COOLDOWN_MINUTES * 60_000))
  const results = []
  for (const candidate of candidates) {
    results.push(await topUp(stripe, candidate, { free, promotionCodeId, window }))
  }

  console.log(`[topups] branch=${env.NEON_BRANCH} invocation=${delivery.invocation.invocationId} free=${free} candidates=${candidates.length} ` + results.map((r) => `${r.accountId}:${r.status}`).join(' '))
  return c.json({ candidates: candidates.length, results })
})

async function topUp(stripe: Stripe, candidate: Candidate, options: { free: boolean; promotionCodeId: string | null; window: number }) {
  const { account_id: accountId, customer, payment_method: paymentMethod, amount_cents: amount } = candidate
  try {
    if (options.free && !options.promotionCodeId) throw new Error(`Promotion code ${AUTO_PROMOTION_CODE} isn't synced yet (run npm run seed).`)
    const invoice = await createCreditInvoice(stripe, {
      customer,
      amountCents: amount,
      promotionCodeId: options.free ? options.promotionCodeId : null,
      paymentMethod: options.free ? null : paymentMethod,
      key: `topup:${accountId}:${options.window}`,
      metadata: { account_id: accountId, kind: 'auto_topup' },
    })
    await sql`
      insert into app.topups (account_id, invoice_id, amount_cents, status)
      values (${accountId}, ${invoice.id}, ${amount}, ${invoice.status ?? 'open'})
      on conflict (invoice_id) do nothing`
    return { accountId, status: invoice.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auto top-up failed.'
    await sql.transaction([
      sql`insert into app.topups (account_id, amount_cents, status, error) values (${accountId}, ${amount}, 'failed', ${message})`,
      sql`update app.accounts set auto_topup_enabled = false, auto_topup_error = ${message} where id = ${accountId}`,
    ])
    console.error(`[topups] account=${accountId} failed`, error)
    return { accountId, status: 'failed' }
  }
}

export default app
