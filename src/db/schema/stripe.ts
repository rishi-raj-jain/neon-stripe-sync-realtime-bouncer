import { bigint, boolean, jsonb, pgSchema, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Read-only Drizzle mappings for the tables Stripe Data Pipeline maintains
 * (real-time sync to Postgres, schema for API version 2026-03-25.dahlia):
 * https://docs.stripe.com/data/data-pipeline/real-time-sync-to-postgres/schema
 *
 * Only the columns this app reads are mapped. Stripe owns these tables: never write to
 * them, never add triggers to them, and keep this file OUT of drizzle.config.ts so
 * drizzle-kit never generates DDL for it.
 *
 * Conventions in the synced schema:
 *   - every column is generated from `_raw_data` (the full API object as jsonb)
 *   - `id` is the Stripe object id (text); primary key is (id, _account_id)
 *   - unix timestamps (`created`, …) are bigint seconds
 *   - nested objects and `metadata` are jsonb
 *
 * Sync latency (public preview): changes land within seconds, except updates to
 * `payment_intents` and creates in `checkout_sessions`, which can take up to 10 minutes.
 * That is why paid orders are read from `charges`; free orders from sessions and invoices.
 */
const stripe = pgSchema('stripe')

const unixSeconds = (name: string) => bigint(name, { mode: 'number' })
const syncColumns = {
  accountId: text('_account_id'),
  syncedAt: timestamp('_updated_at', { withTimezone: true }),
}

export type CardDetails = { type?: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } }

export const stripeCustomers = stripe.table('customers', {
  id: text('id').primaryKey(),
  email: text('email'),
  name: text('name'),
  metadata: jsonb('metadata').$type<Record<string, string>>(),
  created: unixSeconds('created'),
  ...syncColumns,
})

/** Every purchase and auto top-up ends up here, including the card it was paid with. */
export const stripeCharges = stripe.table('charges', {
  id: text('id').primaryKey(),
  customer: text('customer'),
  paymentIntent: text('payment_intent'),
  paymentMethod: text('payment_method'),
  paymentMethodDetails: jsonb('payment_method_details').$type<CardDetails>(),
  amount: bigint('amount', { mode: 'number' }),
  amountRefunded: bigint('amount_refunded', { mode: 'number' }),
  currency: text('currency'),
  status: text('status'),
  paid: boolean('paid'),
  refunded: boolean('refunded'),
  disputed: boolean('disputed'),
  receiptUrl: text('receipt_url'),
  metadata: jsonb('metadata').$type<Record<string, string>>(),
  created: unixSeconds('created'),
  ...syncColumns,
})

export const stripePrices = stripe.table('prices', {
  id: text('id').primaryKey(),
  lookupKey: text('lookup_key'),
  active: boolean('active'),
  unitAmount: bigint('unit_amount', { mode: 'number' }),
  currency: text('currency'),
  created: unixSeconds('created'),
  ...syncColumns,
})

/**
 * Free orders: a 100% promotion code makes Checkout complete with no PaymentIntent or charge,
 * so the completed $0 session is the purchase record (metadata.credits_cents = face value).
 * Preview caveat: *creates* in this table can take up to 10 minutes to sync.
 */
export const stripeCheckoutSessions = stripe.table('checkout_sessions', {
  id: text('id').primaryKey(),
  customer: text('customer'),
  mode: text('mode'),
  status: text('status'),
  paymentStatus: text('payment_status'),
  amountTotal: bigint('amount_total', { mode: 'number' }),
  metadata: jsonb('metadata').$type<Record<string, string>>(),
  created: unixSeconds('created'),
  ...syncColumns,
})

/** Auto top-ups are invoices (free ones are paid at $0 with the promotion code). */
export const stripeInvoices = stripe.table('invoices', {
  id: text('id').primaryKey(),
  customer: text('customer'),
  status: text('status'),
  total: bigint('total', { mode: 'number' }),
  amountPaid: bigint('amount_paid', { mode: 'number' }),
  hostedInvoiceUrl: text('hosted_invoice_url'),
  metadata: jsonb('metadata').$type<Record<string, string>>(),
  created: unixSeconds('created'),
  ...syncColumns,
})

export const stripePromotionCodes = stripe.table('promotion_codes', {
  id: text('id').primaryKey(),
  code: text('code'),
  active: boolean('active'),
  created: unixSeconds('created'),
  ...syncColumns,
})
