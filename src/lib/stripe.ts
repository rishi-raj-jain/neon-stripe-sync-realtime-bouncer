import 'server-only'

import { db } from '@/db/client'
import { accounts, type Account } from '@/db/schema/app'
import { stripeCustomers, stripePrices, stripePromotionCodes } from '@/db/schema/stripe'
import { env } from '@/env'
import type { SessionUser } from '@/lib/auth/server'
import { isPlaceholderEmail, usernameToEmail } from '@/lib/auth/username'
import { and, desc, eq } from 'drizzle-orm'
import Stripe from 'stripe'

/**
 * Stripe is only ever *written* through the API. Everything we *read* comes from the
 * synced `stripe.*` tables in Neon, so the app has no webhook endpoint at all.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: 'tollbooth' } })

/**
 * The account's Stripe customer, created up front and stored on app.accounts, so the wallet
 * can join charges by customer id (charges sync within seconds). A stored id is re-checked
 * against the current Stripe account (the synced row settles it without an API call), so
 * switching keys heals itself.
 */
export async function ensureStripeCustomer(account: Account, user: SessionUser): Promise<string> {
  const email = billingEmail(user)

  if (account.stripeCustomerId) {
    const [synced] = await db.select({ email: stripeCustomers.email }).from(stripeCustomers).where(eq(stripeCustomers.id, account.stripeCustomerId)).limit(1)
    const current = synced ?? (await retrieveCustomer(account.stripeCustomerId))
    if (current) {
      // Keep the email Checkout prefills in step (e.g. DEMO_EMAIL changed).
      if (email && current.email !== email) await stripe.customers.update(account.stripeCustomerId, { email })
      return account.stripeCustomerId
    }
  }

  const customer = await stripe.customers.create(
    { name: account.label, ...(email && { email }), metadata: { app: 'tollbooth', account_id: account.id } },
    // Two tabs racing here get the same customer back instead of two customers.
    { idempotencyKey: `customer:${account.id}:${account.stripeCustomerId ?? 'new'}` },
  )
  await db.update(accounts).set({ stripeCustomerId: customer.id }).where(eq(accounts.id, account.id))
  return customer.id
}

/**
 * The email Stripe Checkout prefills. The demo account gets DEMO_EMAIL; other username
 * accounts carry a placeholder address that must never reach Stripe, so Checkout asks.
 */
function billingEmail(user: SessionUser): string | undefined {
  if (user.email.toLowerCase() === usernameToEmail(env.DEMO_USERNAME)) return env.DEMO_EMAIL
  return isPlaceholderEmail(user.email) ? undefined : user.email
}

async function retrieveCustomer(id: string): Promise<{ email: string | null } | null> {
  try {
    const customer = await stripe.customers.retrieve(id)
    return 'deleted' in customer && customer.deleted ? null : { email: customer.email }
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') return null
    throw error
  }
}

/** Active price for a credit pack, read from the synced `stripe.prices` table by lookup key. */
export async function resolvePriceId(lookupKey: string): Promise<string> {
  const [price] = await db
    .select({ id: stripePrices.id })
    .from(stripePrices)
    .where(and(eq(stripePrices.lookupKey, lookupKey), eq(stripePrices.active, true)))
    .orderBy(desc(stripePrices.created))
    .limit(1)
  if (price) return price.id

  // Not synced yet (e.g. a freshly created price): ask Stripe directly.
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  if (!data[0]) throw new Error(`no active Stripe price with lookup_key ${lookupKey} (run npm run seed)`)
  return data[0].id
}

/** Promotion code id for a customer-facing code, from the synced `stripe.promotion_codes` first. */
export async function resolvePromotionCodeId(code: string): Promise<string> {
  const [promo] = await db
    .select({ id: stripePromotionCodes.id })
    .from(stripePromotionCodes)
    .where(and(eq(stripePromotionCodes.code, code), eq(stripePromotionCodes.active, true)))
    .orderBy(desc(stripePromotionCodes.created))
    .limit(1)
  if (promo) return promo.id

  const { data } = await stripe.promotionCodes.list({ code, active: true, limit: 1 })
  if (!data[0]) throw new Error(`no active Stripe promotion code ${code} (run npm run seed)`)
  return data[0].id
}
