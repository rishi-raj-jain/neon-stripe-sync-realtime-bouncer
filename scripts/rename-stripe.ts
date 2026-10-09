import '@dotenvx/dotenvx/config'

import { APP_TAG, AUTO_PROMOTION_CODE, CREDIT_PACKS } from '@/shared/pricing'
import { neon } from '@neondatabase/serverless'
import Stripe from 'stripe'
import * as v from 'valibot'

/**
 * One-off, for a Stripe account that served this app under its first name (Tollbooth). Moves
 * what Stripe still holds under the old name over to Bouncer:
 *
 *   1. Customers, invoices, Checkout Sessions and charges tagged metadata.app = 'tollbooth' are
 *      retagged APP_TAG (the balance view only counts free top-up invoices with that tag), and
 *      invoice descriptions and items that say "Tollbooth" are renamed where Stripe allows it.
 *   2. The old credit-pack prices are archived and their product renamed and archived.
 *   3. The old promotion code is deactivated and its coupon renamed.
 *
 * Only objects carrying the old tag, price lookup keys or code are touched, so anything else in
 * the same Stripe account is left alone. IDs come from the synced stripe.* tables; writes go to
 * Stripe's API and sync back. Safe to re-run. Run `npm run seed` first (it creates the new
 * prices and code), then:
 *
 *   npx tsx scripts/rename-stripe.ts            # dry run: lists what would change
 *   npx tsx scripts/rename-stripe.ts --apply    # makes the changes
 *
 * Delete this file once it has run.
 */
const OLD_TAG = 'tollbooth'
const OLD_NAME = /tollbooth/i
const OLD_PROMOTION_CODE = 'TOLLBOOTH100'
const OLD_LOOKUP_KEYS = Object.values(CREDIT_PACKS).map((pack) => pack.lookupKey.replace(/^bouncer_/, 'tollbooth_'))
const RETIRED_PRODUCT_NAME = 'Bouncer moderation credits (retired)'
const RETIRED_COUPON_NAME = 'Bouncer: every purchase free (retired)'
const INVOICE_DESCRIPTION = 'Bouncer moderation credits'

const env = v.parse(
  v.object({
    STRIPE_SECRET_KEY: v.pipe(v.string(), v.startsWith('sk_', 'STRIPE_SECRET_KEY must be a secret key (sk_…)')),
    DATABASE_URL: v.pipe(v.string(), v.url()),
  }),
  process.env,
)

const apply = process.argv.includes('--apply')
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: 'bouncer-rename' } })
const sql = neon(env.DATABASE_URL)
const counts = { changed: 0, skipped: 0, failed: 0 }

/** Runs (or, in a dry run, only prints) one change. A failure is reported, never fatal. */
async function change(label: string, run: () => Promise<unknown>) {
  if (!apply) {
    console.log(`  would ${label}`)
    counts.changed++
    return
  }
  try {
    await run()
    console.log(`  ✓ ${label}`)
    counts.changed++
  } catch (error) {
    console.log(`  ✗ ${label}: ${(error as Error).message}`)
    counts.failed++
  }
}

/** The new prices and code must exist first, or Checkout and top-ups break once the old ones go. */
async function preflight() {
  const lookupKeys: string[] = Object.values(CREDIT_PACKS).map((pack) => pack.lookupKey)
  const { data: prices } = await stripe.prices.list({ lookup_keys: lookupKeys, active: true, limit: 10 })
  const missing = lookupKeys.filter((key) => !prices.some((price) => price.lookup_key === key))
  if (AUTO_PROMOTION_CODE) {
    const { data: codes } = await stripe.promotionCodes.list({ code: AUTO_PROMOTION_CODE, active: true, limit: 1 })
    if (!codes[0]) missing.push(AUTO_PROMOTION_CODE)
  }
  if (missing.length === 0) return
  const message = `Missing ${missing.join(', ')} in Stripe: run npm run seed first.`
  if (apply) throw new Error(message)
  console.log(`Note: ${message} (--apply refuses until then.)\n`)
}

async function taggedIds(table: 'customers' | 'invoices' | 'checkout_sessions' | 'charges'): Promise<string[]> {
  const rows = (await sql.query(`select id from stripe.${table} where metadata ->> 'app' = $1 order by id`, [OLD_TAG])) as { id: string }[]
  return rows.map((row) => row.id)
}

async function retag() {
  const metadata = { app: APP_TAG }

  console.log('Customers')
  for (const id of await taggedIds('customers')) await change(`retag ${id}`, () => stripe.customers.update(id, { metadata }))

  console.log('Charges')
  for (const id of await taggedIds('charges')) await change(`retag ${id}`, () => stripe.charges.update(id, { metadata }))

  console.log('Checkout Sessions')
  for (const id of await taggedIds('checkout_sessions')) await change(`retag ${id}`, () => stripe.checkout.sessions.update(id, { metadata }))

  console.log('Invoices')
  for (const id of await taggedIds('invoices')) {
    await change(`retag ${id}`, () => stripe.invoices.update(id, { metadata }))
    const invoice = await stripe.invoices.retrieve(id)
    if (invoice.description && OLD_NAME.test(invoice.description)) {
      await change(`rename ${id} description`, () => stripe.invoices.update(id, { description: INVOICE_DESCRIPTION }))
    }
    // Items on a finalized invoice may refuse changes; Stripe keeps those as they were billed.
    for await (const item of stripe.invoiceItems.list({ invoice: id, limit: 100 })) {
      if (item.metadata?.app !== OLD_TAG && !(item.description && OLD_NAME.test(item.description))) continue
      await change(`retag item ${item.id}`, () => stripe.invoiceItems.update(item.id, { metadata, ...(item.description && OLD_NAME.test(item.description) && { description: INVOICE_DESCRIPTION }) }))
    }
  }
}

async function retirePrices() {
  console.log('Old prices and product')
  const { data: prices } = await stripe.prices.list({ lookup_keys: OLD_LOOKUP_KEYS, limit: 10 })
  const products = new Set<string>()
  for (const price of prices) {
    products.add(typeof price.product === 'string' ? price.product : price.product.id)
    if (price.active) await change(`archive price ${price.id} (${price.lookup_key})`, () => stripe.prices.update(price.id, { active: false }))
    else counts.skipped++
  }
  for (const id of products) {
    const product = await stripe.products.retrieve(id)
    if (!product.active && !OLD_NAME.test(product.name)) {
      counts.skipped++
      continue
    }
    await change(`rename and archive product ${id} ("${product.name}")`, () => stripe.products.update(id, { name: RETIRED_PRODUCT_NAME, active: false, metadata: { app: APP_TAG } }))
  }
}

async function retirePromotionCode() {
  console.log(`Promotion code ${OLD_PROMOTION_CODE}`)
  const { data: codes } = await stripe.promotionCodes.list({ code: OLD_PROMOTION_CODE, limit: 10 })
  for (const code of codes) {
    if (code.active) await change(`deactivate ${code.id}`, () => stripe.promotionCodes.update(code.id, { active: false }))
    else counts.skipped++
    const couponRef = code.promotion.coupon
    const coupon = typeof couponRef === 'string' ? await stripe.coupons.retrieve(couponRef) : couponRef
    if (coupon && coupon.name && OLD_NAME.test(coupon.name)) {
      await change(`rename coupon ${coupon.id} ("${coupon.name}")`, () => stripe.coupons.update(coupon.id, { name: RETIRED_COUPON_NAME, metadata: { app: APP_TAG } }))
    }
  }
}

console.log(`${apply ? 'Applying' : 'Dry run'} in ${env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'test'} mode`)
await preflight()
await retag()
await retirePrices()
await retirePromotionCode()
console.log(`\n${apply ? 'Changed' : 'Would change'} ${counts.changed}, already done ${counts.skipped}, failed ${counts.failed}.`)
if (!apply) console.log('Nothing was changed. Re-run with --apply.')
else console.log('Changes sync back into the stripe.* tables within seconds.')
if (counts.failed > 0) process.exitCode = 1
