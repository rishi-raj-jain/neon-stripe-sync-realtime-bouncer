import 'server-only'

import { db } from '@/db/client'
import { accounts, apiKeys, balances, topups, usageEvents, type Account } from '@/db/schema/app'
import { stripeCharges, stripeCheckoutSessions, stripeInvoices } from '@/db/schema/stripe'
import { AUTO_PROMOTION_CODE, DAILY_REQUEST_LIMIT } from '@/shared/pricing'
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'

/*
 * Everything the customer dashboard shows. Each read is a query builder (not a promise), so
 * `getDashboard` sends them all in one `db.batch`: one HTTP round trip, one snapshot.
 */

const balanceQuery = (accountId: string) =>
  db.select({ purchasedMicros: balances.purchasedMicros, spentMicros: balances.spentMicros, balanceMicros: balances.balanceMicros }).from(balances).where(eq(balances.accountId, accountId)).limit(1)

/** Purchases and top-ups, straight from the synced charges (receipts included). */
const chargesQuery = (customerId: string) =>
  db
    .select({
      id: stripeCharges.id,
      amount: stripeCharges.amount,
      amountRefunded: stripeCharges.amountRefunded,
      refunded: stripeCharges.refunded,
      disputed: stripeCharges.disputed,
      status: stripeCharges.status,
      receiptUrl: stripeCharges.receiptUrl,
      kind: sql<string | null>`${stripeCharges.metadata} ->> 'kind'`,
      card: sql<{ brand?: string; last4?: string } | null>`${stripeCharges.paymentMethodDetails} -> 'card'`,
      paymentMethod: stripeCharges.paymentMethod,
      created: stripeCharges.created,
    })
    .from(stripeCharges)
    .where(eq(stripeCharges.customer, customerId))
    .orderBy(desc(stripeCharges.created))
    .limit(10)

/** Free Checkout orders (100% promotion code): completed $0 sessions, at face value. */
const freeOrdersQuery = (customerId: string) =>
  db
    .select({
      id: stripeCheckoutSessions.id,
      creditsCents: sql<string | null>`${stripeCheckoutSessions.metadata} ->> 'credits_cents'`,
      created: stripeCheckoutSessions.created,
    })
    .from(stripeCheckoutSessions)
    .where(
      and(
        eq(stripeCheckoutSessions.customer, customerId),
        eq(stripeCheckoutSessions.mode, 'payment'),
        eq(stripeCheckoutSessions.status, 'complete'),
        inArray(stripeCheckoutSessions.paymentStatus, ['paid', 'no_payment_required']),
        eq(stripeCheckoutSessions.amountTotal, 0),
      ),
    )
    .orderBy(desc(stripeCheckoutSessions.created))
    .limit(10)

/** Free auto top-ups: paid $0 invoices, at face value. */
const freeInvoicesQuery = (customerId: string) =>
  db
    .select({
      id: stripeInvoices.id,
      creditsCents: sql<string | null>`${stripeInvoices.metadata} ->> 'credits_cents'`,
      kind: sql<string | null>`${stripeInvoices.metadata} ->> 'kind'`,
      url: stripeInvoices.hostedInvoiceUrl,
      created: stripeInvoices.created,
    })
    .from(stripeInvoices)
    .where(and(eq(stripeInvoices.customer, customerId), eq(stripeInvoices.status, 'paid'), eq(stripeInvoices.total, 0), sql`${stripeInvoices.metadata} ->> 'app' = 'tollbooth'`))
    .orderBy(desc(stripeInvoices.created))
    .limit(10)

const topupsQuery = (accountId: string) =>
  db
    .select({ id: topups.id, amountCents: topups.amountCents, status: topups.status, error: topups.error, createdAt: topups.createdAt })
    .from(topups)
    .where(eq(topups.accountId, accountId))
    .orderBy(desc(topups.createdAt))
    .limit(5)

const keysQuery = (accountId: string) =>
  db
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.accountId, accountId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt))

/** Spend per day for the last 30 days. */
const dailyQuery = (accountId: string) =>
  db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${usageEvents.createdAt}), 'YYYY-MM-DD')`,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens})::bigint`,
      spentMicros: sql<number>`sum(${usageEvents.priceMicros})::bigint`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.accountId, accountId), gt(usageEvents.createdAt, sql`now() - interval '30 days'`)))
    .groupBy(sql`1`)
    .orderBy(sql`1`)

/** The demo's daily limit: billed calls in the last 24 hours, and when the oldest ages out. */
const limitQuery = (accountId: string) =>
  db
    .select({ used: sql<number>`count(*)::int`, oldest: sql<string | null>`min(${usageEvents.createdAt})` })
    .from(usageEvents)
    .where(and(eq(usageEvents.accountId, accountId), gt(usageEvents.createdAt, sql`now() - interval '24 hours'`)))

const recentQuery = (accountId: string) =>
  db
    .select({
      id: usageEvents.id,
      model: usageEvents.model,
      inputTokens: usageEvents.inputTokens,
      outputTokens: usageEvents.outputTokens,
      reasoningTokens: usageEvents.reasoningTokens,
      priceMicros: usageEvents.priceMicros,
      latencyMs: usageEvents.latencyMs,
      createdAt: usageEvents.createdAt,
    })
    .from(usageEvents)
    .where(eq(usageEvents.accountId, accountId))
    .orderBy(desc(usageEvents.createdAt))
    .limit(15)

const n = (value: unknown) => Number(value ?? 0)

export async function getDashboard(account: Account) {
  // Without a Stripe customer there are no charges; query an id that can't match.
  const customerId = account.stripeCustomerId ?? ''
  const [[balance], charges, freeOrders, freeInvoices, recentTopups, keys, daily, recent, [today]] = await db.batch([
    balanceQuery(account.id),
    chargesQuery(customerId),
    freeOrdersQuery(customerId),
    freeInvoicesQuery(customerId),
    topupsQuery(account.id),
    keysQuery(account.id),
    dailyQuery(account.id),
    recentQuery(account.id),
    limitQuery(account.id),
  ])

  // The card on file: whatever the latest successful charge was paid with (saved off-session).
  const lastPaid = charges.find((charge) => charge.status === 'succeeded' && charge.paymentMethod)
  return {
    wallet: {
      purchasedMicros: n(balance?.purchasedMicros),
      spentMicros: n(balance?.spentMicros),
      balanceMicros: n(balance?.balanceMicros),
    },
    card: lastPaid?.card?.last4 ? { brand: lastPaid.card.brand ?? 'card', last4: lastPaid.card.last4 } : null,
    // Every way credits arrive, newest first: paid charges, free Checkout orders, free top-ups.
    purchases: [
      ...charges.map((charge) => ({
        id: charge.id,
        amountCents: n(charge.amount),
        refundedCents: n(charge.amountRefunded),
        status: charge.status ?? 'unknown',
        disputed: charge.disputed ?? false,
        receiptUrl: charge.receiptUrl,
        auto: charge.kind === 'auto_topup',
        created: n(charge.created),
      })),
      ...freeOrders.map((order) => ({ id: order.id, amountCents: n(order.creditsCents), refundedCents: 0, status: 'succeeded', disputed: false, receiptUrl: null, auto: false, created: n(order.created) })),
      ...freeInvoices.map((invoice) => ({
        id: invoice.id,
        amountCents: n(invoice.creditsCents),
        refundedCents: 0,
        status: 'succeeded',
        disputed: false,
        receiptUrl: invoice.url,
        auto: invoice.kind === 'auto_topup',
        created: n(invoice.created),
      })),
    ]
      .sort((a, b) => b.created - a.created)
      .slice(0, 10),
    autoTopup: {
      // Free top-ups need no card, only a Stripe customer; paid ones need the saved card.
      available: AUTO_PROMOTION_CODE ? Boolean(account.stripeCustomerId) && n(balance?.purchasedMicros) > 0 : Boolean(lastPaid),
      enabled: account.autoTopupEnabled,
      thresholdCents: Math.round(account.autoTopupThresholdMicros / 10_000),
      amountCents: account.autoTopupAmountCents,
      error: account.autoTopupError,
      recent: recentTopups.map((topup) => ({ ...topup, createdAt: topup.createdAt.toISOString() })),
    },
    limit: {
      perDay: DAILY_REQUEST_LIMIT,
      used: n(today?.used),
      remaining: Math.max(0, DAILY_REQUEST_LIMIT - n(today?.used)),
      nextSlotAt: today?.oldest ? new Date(Date.parse(today.oldest) + 24 * 3_600_000).toISOString() : null,
    },
    keys: keys.map((key) => ({ ...key, createdAt: key.createdAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null })),
    usage: {
      daily: daily.map((day) => ({ day: day.day, requests: n(day.requests), tokens: n(day.tokens), spentMicros: n(day.spentMicros) })),
      recent: recent.map((event) => ({ ...event, priceMicros: n(event.priceMicros), createdAt: event.createdAt.toISOString() })),
    },
  }
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>

export async function updateAutoTopup(accountId: string, settings: { enabled: boolean; thresholdCents: number; amountCents: number }) {
  await db
    .update(accounts)
    .set({
      autoTopupEnabled: settings.enabled,
      autoTopupThresholdMicros: settings.thresholdCents * 10_000,
      autoTopupAmountCents: settings.amountCents,
      // Turning it back on clears the last failure.
      ...(settings.enabled && { autoTopupError: null }),
    })
    .where(eq(accounts.id, accountId))
}
