import '@dotenvx/dotenvx/config'

import { APP_TAG, AUTO_PROMOTION_CODE, CREDIT_PACKS } from '@/shared/pricing'
import Stripe from 'stripe'
import * as v from 'valibot'

/**
 * The Stripe objects the app expects, safe to re-run:
 *
 *   1. The credit-pack prices, found later by lookup key (no price ids in code).
 *   2. The 100%-off promotion code every purchase uses (AUTO_PROMOTION_CODE), when set.
 *
 * Both sync into stripe.prices / stripe.promotion_codes, where the app reads them.
 *
 *   npm run seed            (test mode only)
 */
const env = v.parse(
  v.object({
    STRIPE_SECRET_KEY: v.pipe(v.string(), v.regex(/^sk_test_/, 'seed only runs with a test-mode (sk_test_) key')),
  }),
  process.env,
)

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: 'bouncer-seed' } })

async function seedCatalog() {
  const lookupKeys = Object.values(CREDIT_PACKS).map((pack) => pack.lookupKey)
  const { data: existing } = await stripe.prices.list({ lookup_keys: lookupKeys, active: true, limit: 10 })
  const have = new Set(existing.map((price) => price.lookup_key))
  const missing = Object.values(CREDIT_PACKS).filter((pack) => !have.has(pack.lookupKey))
  if (missing.length === 0) return console.log('✓ Stripe prices already exist')

  const product = await stripe.products.create({ name: 'Bouncer moderation credits', metadata: { app: APP_TAG } }, { idempotencyKey: 'bouncer-seed-product' })
  for (const pack of missing) {
    await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: pack.cents, lookup_key: pack.lookupKey, nickname: `${pack.label} credits` })
  }
  console.log(`✓ Created ${missing.length} Stripe prices`)
}

/** The 100%-off coupon behind AUTO_PROMOTION_CODE, and the code itself. */
async function seedPromotionCode() {
  if (!AUTO_PROMOTION_CODE) return console.log('· AUTO_PROMOTION_CODE is null: purchases are charged, no code needed')
  const { data: existing } = await stripe.promotionCodes.list({ code: AUTO_PROMOTION_CODE, active: true, limit: 1 })
  if (existing[0]) return console.log(`✓ Promotion code ${AUTO_PROMOTION_CODE} already exists`)

  const coupon = await stripe.coupons.create({ percent_off: 100, duration: 'forever', name: 'Bouncer: every purchase free' }, { idempotencyKey: 'bouncer-seed-coupon' })
  await stripe.promotionCodes.create({ code: AUTO_PROMOTION_CODE, promotion: { type: 'coupon', coupon: coupon.id } }, { idempotencyKey: 'bouncer-seed-promo' })
  console.log(`✓ Created promotion code ${AUTO_PROMOTION_CODE} (100% off)`)
}

await seedCatalog()
await seedPromotionCode()
console.log('Done. They sync into stripe.prices and stripe.promotion_codes within seconds.')
