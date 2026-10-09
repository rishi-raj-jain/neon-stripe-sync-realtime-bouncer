import { env } from '@/env'
import { ensureAccount } from '@/lib/accounts'
import { getUser, unauthorized } from '@/lib/auth/server'
import { ensureStripeCustomer, resolvePriceId, resolvePromotionCodeId, stripe } from '@/lib/stripe'
import { APP_TAG, AUTO_PROMOTION_CODE, CREDIT_PACKS, type PackId } from '@/shared/pricing'
import * as v from 'valibot'

const Body = v.object({ pack: v.picklist(Object.keys(CREDIT_PACKS) as [PackId, ...PackId[]]) })

/**
 * POST /api/checkout  { pack }  →  { url }
 *
 * Stripe Checkout for a credit pack, with AUTO_PROMOTION_CODE (100% off) applied when set: the
 * session completes at $0 with no card, and app.balances counts the completed session at the
 * pack's face value (metadata.credits_cents). Without the code, the card is saved for
 * off-session use so auto top-ups can charge it. No webhook either way: the session (or the
 * charge) syncs into Postgres and the balance view picks it up.
 */
export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return unauthorized()

  const parsed = v.safeParse(Body, await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid pack' }, { status: 400 })
  const pack = CREDIT_PACKS[parsed.output.pack]

  const account = await ensureAccount(user)
  const [customer, price, promotionCode] = await Promise.all([ensureStripeCustomer(account, user), resolvePriceId(pack.lookupKey), AUTO_PROMOTION_CODE ? resolvePromotionCodeId(AUTO_PROMOTION_CODE) : null])
  const metadata = { app: APP_TAG, account_id: account.id, kind: 'credits', pack: parsed.output.pack, credits_cents: String(pack.cents) }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer,
    client_reference_id: account.id,
    line_items: [{ price, quantity: 1 }],
    // Free: the discount takes the total to $0 (no PaymentIntent). Paid: save the card for top-ups.
    ...(promotionCode ? { discounts: [{ promotion_code: promotionCode }] } : { payment_intent_data: { setup_future_usage: 'off_session' as const, metadata } }),
    metadata,
    success_url: `${env.APP_URL}/dashboard?view=billing&checkout=success`,
    cancel_url: `${env.APP_URL}/dashboard?view=billing&checkout=cancelled`,
  })
  if (!session.url) return Response.json({ error: 'checkout unavailable' }, { status: 502 })
  return Response.json({ url: session.url })
}
