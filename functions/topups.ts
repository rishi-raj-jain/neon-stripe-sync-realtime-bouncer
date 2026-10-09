import { AUTO_PROMOTION_CODE } from '@/shared/pricing'
import { findTopupCandidates, scheduledTopupKey, topUp, topupPromotionId } from '@/shared/topups'
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
 *
 * The logic lives in src/shared/topups.ts; the dashboard's "Top up now" button runs the same
 * code for one account without waiting for this schedule.
 */
const app = new Hono()

app.post('/', async (c) => {
  const delivery = await parseTriggerDelivery(c.req.raw)
  if (!delivery.ok) return c.json({ error: delivery.error }, 401)
  if (delivery.invocation.trigger.type !== 'schedule') return c.json({ error: 'expected schedule' }, 400)
  if (!env.STRIPE_SECRET_KEY) return c.json({ error: 'STRIPE_SECRET_KEY is not set for this function' }, 500)
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: 'bouncer' } })

  const promotionCodeId = await topupPromotionId(sql)
  const candidates = await findTopupCandidates(sql)

  const results = []
  for (const candidate of candidates) {
    results.push(await topUp(sql, stripe, candidate, { promotionCodeId, key: scheduledTopupKey(candidate.account_id), manual: false }))
  }

  console.log(
    `[topups] branch=${env.NEON_BRANCH} invocation=${delivery.invocation.invocationId} free=${AUTO_PROMOTION_CODE !== null} candidates=${candidates.length} ` + results.map((r) => `${r.accountId}:${r.status}`).join(' '),
  )
  return c.json({ candidates: candidates.length, results })
})

export default app
