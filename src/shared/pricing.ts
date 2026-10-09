/** Domain constants shared by the Next.js app (Vercel) and the Neon Functions. Keep it dependency-free. */

/**
 * The one model we resell, and the one that answers EVERY request whatever `model` the caller
 * sends: gpt-oss-20b, the cheapest per call on Neon AI Gateway ($0.07 in / $0.30 out per million
 * tokens, list price). What we pay per token lives in `app.model_costs`, what we charge in
 * `app.model_rates` (both per million tokens).
 */
export const DEFAULT_MODEL = 'gpt-oss-20b'

/**
 * Money is integer micro-dollars (1e-6 USD) everywhere in the ledger, so a single token at
 * $0.05 per million is exactly 0.05 micros and sums never drift. Stripe amounts are cents.
 */
export const MICROS_PER_USD = 1_000_000
export const MICROS_PER_CENT = 10_000

/** Credit packs sold through Stripe Checkout, found by lookup key (no price ids in code). */
export const CREDIT_PACKS = {
  starter: { label: 'Starter', cents: 1000, lookupKey: 'tollbooth_credits_10' },
  growth: { label: 'Growth', cents: 2500, lookupKey: 'tollbooth_credits_25' },
  scale: { label: 'Scale', cents: 10000, lookupKey: 'tollbooth_credits_100' },
} as const
export type PackId = keyof typeof CREDIT_PACKS

/**
 * Every purchase is free in this demo: this promotion code (100% off, created by `npm run seed`)
 * is applied to every Checkout Session and every auto top-up invoice. Set to null to charge for
 * real; the rest of the billing code handles both.
 */
export const AUTO_PROMOTION_CODE: string | null = 'TOLLBOOTH100'

/** Auto top-up: when the balance drops under the threshold, add this much (a Stripe invoice). */
export const TOPUP_AMOUNTS_CENTS = [1000, 2500, 10000] as const
export const TOPUP_THRESHOLDS_CENTS = [200, 500, 1000] as const
/** Never two top-ups for one account inside this window (the charge needs a moment to sync). */
export const TOPUP_COOLDOWN_MINUTES = 15

/** API keys: `tb_` + 32 random bytes, base64url. Only a SHA-256 of the key is stored. */
export const API_KEY_PREFIX = 'tb_'
/** Characters of the key shown in the dashboard to tell keys apart (e.g. `tb_x7Yq2…`). */
export const API_KEY_VISIBLE_CHARS = 8

/**
 * Demo guard against abuse: billed generations one account may make in any rolling 24 hours.
 * Checked by the `api` function in the same query as the key and balance (429 once used up).
 */
export const DAILY_REQUEST_LIMIT = 2

/** Output budget per request when the caller doesn't set one, and the most they may ask for. */
export const DEFAULT_MAX_COMPLETION_TOKENS = 2048
export const MAX_COMPLETION_TOKENS = 8192

export const usd = (micros: number) => micros / MICROS_PER_USD
