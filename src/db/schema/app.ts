import { sql } from 'drizzle-orm'
import { bigint, boolean, check, index, integer, jsonb, numeric, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Everything this app owns lives in the `app` schema. The database has three owners:
 *   neon_auth.*  Managed Better Auth (dashboard users, sessions)
 *   stripe.*     Stripe Data Pipeline (read-only for us, see ./stripe.ts)
 *   app.*        this file (tables, via drizzle-kit) + drizzle/0001_* (SQL functions, views)
 *
 * Money is integer micro-dollars (`*_micros`, 1e-6 USD). Rates are USD per million tokens,
 * so tokens × rate = micros exactly.
 */
export const app = pgSchema('app')

const usdPerMillionTokens = (name: string) => numeric(name, { precision: 12, scale: 4, mode: 'number' })

/** A paying customer. `user_id` is neon_auth."user".id; seeded demo customers have none. */
export const accounts = app.table(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').unique(),
    label: text('label').notNull(),
    stripeCustomerId: text('stripe_customer_id').unique(),
    autoTopupEnabled: boolean('auto_topup_enabled').notNull().default(false),
    autoTopupThresholdMicros: bigint('auto_topup_threshold_micros', { mode: 'number' }).notNull().default(5_000_000),
    autoTopupAmountCents: integer('auto_topup_amount_cents').notNull().default(1000),
    /** Why the last automatic top-up failed (it then switches itself off). */
    autoTopupError: text('auto_topup_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('accounts_topup_amount_check', sql`${t.autoTopupAmountCents} >= 500`)],
)

/** Only the SHA-256 of a key is stored; the plaintext is shown once, at creation. */
export const apiKeys = app.table(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** First characters of the key, to tell keys apart in the dashboard. */
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('api_keys_account_idx').on(t.accountId)],
)

/**
 * What we CHARGE per model. Reasoning tokens get their own rate because they're the part of
 * the output a customer never sees, and the easiest to misprice.
 */
export const modelRates = app.table('model_rates', {
  model: text('model').primaryKey(),
  inputUsdPerMtok: usdPerMillionTokens('input_usd_per_mtok').notNull(),
  cachedInputUsdPerMtok: usdPerMillionTokens('cached_input_usd_per_mtok').notNull(),
  outputUsdPerMtok: usdPerMillionTokens('output_usd_per_mtok').notNull(),
  reasoningUsdPerMtok: usdPerMillionTokens('reasoning_usd_per_mtok').notNull(),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** What AI Gateway charges US per model (provider list price). Reasoning bills as output. */
export const modelCosts = app.table('model_costs', {
  model: text('model').primaryKey(),
  inputUsdPerMtok: usdPerMillionTokens('input_usd_per_mtok').notNull(),
  cachedInputUsdPerMtok: usdPerMillionTokens('cached_input_usd_per_mtok').notNull(),
  outputUsdPerMtok: usdPerMillionTokens('output_usd_per_mtok').notNull(),
})

/**
 * The usage ledger: one row per billed API call, written by the `api` function. Price and cost
 * are computed in SQL at write time (app.price_micros / app.cost_micros) and never change, so
 * new rates only ever apply to future calls.
 */
export const usageEvents = app.table(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    model: text('model').notNull(),
    /** Prompt tokens, including the cached ones. */
    inputTokens: integer('input_tokens').notNull(),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    /** Completion tokens, including the reasoning ones. */
    outputTokens: integer('output_tokens').notNull(),
    reasoningTokens: integer('reasoning_tokens').notNull().default(0),
    priceMicros: bigint('price_micros', { mode: 'number' }).notNull(),
    costMicros: bigint('cost_micros', { mode: 'number' }).notNull(),
    status: smallint('status').notNull(),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Balance (all-time spend per account): index-only sum.
    index('usage_account_price_idx').on(t.accountId, t.priceMicros),
    // Dashboard charts and recent requests for one account.
    index('usage_account_created_idx').on(t.accountId, t.createdAt),
  ],
)

/** Auto top-ups started by the `topups` function: one Stripe invoice each (it syncs into stripe.invoices). */
export const topups = app.table(
  'topups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    invoiceId: text('invoice_id').unique(),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('topups_account_created_idx').on(t.accountId, t.createdAt)],
)

/*
 * The view is created in SQL by drizzle/0001_* (it reads the Stripe-synced tables, which
 * drizzle-kit can't express). Declared `.existing()` for typed reads only.
 */

/**
 * The wallet. No balance column anywhere and no webhook that increments one:
 *   purchased = succeeded, undisputed charges (pro-rated for refunds), from stripe.charges
 *   spent     = the usage ledger
 */
export const balances = app
  .view('balances', {
    accountId: uuid('account_id').notNull(),
    purchasedMicros: bigint('purchased_micros', { mode: 'number' }).notNull(),
    spentMicros: bigint('spent_micros', { mode: 'number' }).notNull(),
    balanceMicros: bigint('balance_micros', { mode: 'number' }).notNull(),
  })
  .existing()

export type Account = typeof accounts.$inferSelect
export type ModelRate = typeof modelRates.$inferSelect
