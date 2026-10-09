/** Domain constants shared by the Next.js app (Vercel) and the Neon Functions. Keep it dependency-free. */

/**
 * Tags every Stripe object this app creates (`metadata.app`), so the balance view can tell our
 * free top-up invoices apart from anything else in the same Stripe account.
 */
export const APP_TAG = 'bouncer'

/**
 * The model behind the moderation service: gpt-oss-20b, the cheapest per call on Neon AI Gateway
 * ($0.07 in / $0.30 out per million tokens, list price). Callers never pick or see it: they buy
 * moderation verdicts, priced per item in `app.service_prices`. What the tokens cost US lives in
 * `app.model_costs`, so the ledger still shows the margin on every call.
 */
export const DEFAULT_MODEL = 'gpt-oss-20b'

/** The one service we sell, as it's named in `app.service_prices` and the usage ledger. */
export const MODERATION_SERVICE = 'moderate'

/**
 * What `POST /v1/moderate` scores. Each gets a 0–1 score; the verdict comes from the highest one
 * against MODERATION_THRESHOLDS, decided here and not by the model, so it's the same every time.
 */
export const MODERATION_CATEGORIES = ['harassment', 'hate', 'sexual', 'violence', 'self_harm', 'illicit', 'spam'] as const
export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number]
export type ModerationVerdict = 'allow' | 'review' | 'block'
export const MODERATION_THRESHOLDS = { review: 0.4, block: 0.8 } as const

/**
 * Billing unit: one item of up to CHARS_PER_UNIT characters (a longer item counts once per started
 * block). The price of a unit is in `app.service_prices`. Limits bound the work in one request.
 */
export const CHARS_PER_UNIT = 2000
export const MAX_ITEMS_PER_REQUEST = 20
export const MAX_CHARS_PER_ITEM = 8000

/** Units an item is billed as. */
export const unitsFor = (text: string) => Math.max(1, Math.ceil(text.length / CHARS_PER_UNIT))

/**
 * Money is integer micro-dollars (1e-6 USD) everywhere in the ledger, so a single token at
 * $0.05 per million is exactly 0.05 micros and sums never drift. Stripe amounts are cents.
 */
export const MICROS_PER_USD = 1_000_000
export const MICROS_PER_CENT = 10_000

/** Credit packs sold through Stripe Checkout, found by lookup key (no price ids in code). */
export const CREDIT_PACKS = {
  starter: { label: 'Starter', cents: 1000, lookupKey: 'bouncer_credits_10' },
  growth: { label: 'Growth', cents: 2500, lookupKey: 'bouncer_credits_25' },
  scale: { label: 'Scale', cents: 10000, lookupKey: 'bouncer_credits_100' },
} as const
export type PackId = keyof typeof CREDIT_PACKS

/**
 * Every purchase is free in this demo: this promotion code (100% off, created by `npm run seed`)
 * is applied to every Checkout Session and every auto top-up invoice. Set to null to charge for
 * real; the rest of the billing code handles both.
 */
export const AUTO_PROMOTION_CODE: string | null = 'BOUNCER100'

/** Auto top-up: when the balance drops under the threshold, add this much (a Stripe invoice). */
export const TOPUP_AMOUNTS_CENTS = [1000, 2500, 10000] as const
export const TOPUP_THRESHOLDS_CENTS = [200, 500, 1000] as const
/** Never two top-ups for one account inside this window (the charge needs a moment to sync). */
export const TOPUP_COOLDOWN_MINUTES = 15

/** API keys: `bnc_` + 32 random bytes, base64url. Only a SHA-256 of the key is stored. */
export const API_KEY_PREFIX = 'bnc_'
/** Characters of the key shown in the dashboard to tell keys apart (e.g. `bnc_x7Yq2…`). */
export const API_KEY_VISIBLE_CHARS = 8

/**
 * Demo guard against abuse: moderation requests one account may make in any rolling 24 hours
 * (each may carry up to MAX_ITEMS_PER_REQUEST items). Checked by the `api` function in the same
 * query as the key and balance (429 once used up).
 */
export const DAILY_REQUEST_LIMIT = 2

export const usd = (micros: number) => micros / MICROS_PER_USD
