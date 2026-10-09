import { createCreditInvoice } from '@/shared/credit-invoice'
import { AUTO_PROMOTION_CODE, TOPUP_COOLDOWN_MINUTES } from '@/shared/pricing'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import type Stripe from 'stripe'

/**
 * The top-up itself, shared by the scheduled `topups` Neon Function (every 5 minutes, every
 * account) and the dashboard's "Top up now" button (one account, on demand), so both follow the
 * same rules and write the same rows.
 */
type Sql = NeonQueryFunction<false, false>

export type TopupCandidate = { account_id: string; customer: string; payment_method: string | null; amount_cents: number; purchased_micros: string; attempts: number }

export type TopupResult = { accountId: string; status: string; invoiceId?: string; error?: string }

/** The promotion code's id when purchases are free (from the synced stripe.promotion_codes). */
export async function topupPromotionId(sql: Sql): Promise<string | null> {
  if (AUTO_PROMOTION_CODE === null) return null
  const [promotion] = (await sql`select id from stripe.promotion_codes where code = ${AUTO_PROMOTION_CODE} and active order by created desc limit 1`) as { id: string }[]
  return promotion?.id ?? null
}

/**
 * Accounts under their threshold that can be topped up. Free top-ups need no card; paid ones
 * need the card the customer last paid with.
 *
 *   scheduled (no accountId): accounts with auto top-up on, at most one top-up per cooldown window
 *   manual (one accountId):   ignores the switch and the cooldown, but not while an earlier
 *                             top-up hasn't synced back yet, so a double click can't add twice
 */
export async function findTopupCandidates(sql: Sql, options: { accountId?: string } = {}): Promise<TopupCandidate[]> {
  const free = AUTO_PROMOTION_CODE !== null
  const manual = options.accountId !== undefined
  return (await sql`
    select a.id as account_id, a.stripe_customer_id as customer, card.payment_method, a.auto_topup_amount_cents as amount_cents,
           b.purchased_micros, (select count(*)::int from app.topups t where t.account_id = a.id) as attempts
      from app.accounts a
      join app.balances b on b.account_id = a.id
      left join lateral (
        select ch.payment_method
          from stripe.charges ch
         where ch.customer = a.stripe_customer_id
           and ch.status = 'succeeded'
           and ch.payment_method is not null
         order by ch.created desc
         limit 1
      ) card on true
     where (${options.accountId ?? null}::uuid is null or a.id = ${options.accountId ?? null}::uuid)
       and (${manual} or a.auto_topup_enabled)
       and a.stripe_customer_id is not null
       and b.balance_micros < a.auto_topup_threshold_micros
       and (${free} or card.payment_method is not null)
       and (${manual} or not exists (
         select 1 from app.topups t
          where t.account_id = a.id
            and t.created_at > now() - make_interval(mins => ${TOPUP_COOLDOWN_MINUTES})
       ))
       and (not ${manual} or not exists (
         select 1 from app.topups t
          where t.account_id = a.id
            and t.status <> 'failed'
            and t.created_at > now() - make_interval(mins => ${TOPUP_COOLDOWN_MINUTES})
            and not exists (select 1 from stripe.invoices i where i.id = t.invoice_id and i.status = 'paid')
       ))`) as TopupCandidate[]
}

/**
 * Creates the top-up invoice and records it in app.topups. A scheduled failure switches auto
 * top-up off with the reason (instead of retrying forever); a manual one is only recorded and
 * returned, since someone is looking at it.
 */
export async function topUp(sql: Sql, stripe: Stripe, candidate: TopupCandidate, options: { promotionCodeId: string | null; key: string; manual: boolean }): Promise<TopupResult> {
  const { account_id: accountId, customer, payment_method: paymentMethod, amount_cents: amount } = candidate
  const free = AUTO_PROMOTION_CODE !== null
  try {
    if (free && !options.promotionCodeId) throw new Error(`Promotion code ${AUTO_PROMOTION_CODE} isn't synced yet (run npm run seed).`)
    const invoice = await createCreditInvoice(stripe, {
      customer,
      amountCents: amount,
      promotionCodeId: free ? options.promotionCodeId : null,
      paymentMethod: free ? null : paymentMethod,
      key: options.key,
      metadata: { account_id: accountId, kind: 'auto_topup', trigger: options.manual ? 'manual' : 'schedule' },
    })
    await sql`
      insert into app.topups (account_id, invoice_id, amount_cents, status)
      values (${accountId}, ${invoice.id}, ${amount}, ${invoice.status ?? 'open'})
      on conflict (invoice_id) do nothing`
    return { accountId, status: invoice.status ?? 'open', invoiceId: invoice.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auto top-up failed.'
    const failed = sql`insert into app.topups (account_id, amount_cents, status, error) values (${accountId}, ${amount}, 'failed', ${message})`
    if (options.manual) await failed
    else await sql.transaction([failed, sql`update app.accounts set auto_topup_enabled = false, auto_topup_error = ${message} where id = ${accountId}`])
    console.error(`[topups] account=${accountId} failed`, error)
    return { accountId, status: 'failed', error: message }
  }
}

/** Stripe idempotency key for a scheduled top-up: one per account per cooldown window. */
export const scheduledTopupKey = (accountId: string) => `topup:${accountId}:${Math.floor(Date.now() / (TOPUP_COOLDOWN_MINUTES * 60_000))}`

/**
 * Stripe idempotency key for a manual top-up: the same while nothing has changed (two clicks or
 * two tabs get the one invoice), new once a top-up lands (purchased total) or an attempt is
 * recorded (so a retry after a failure isn't answered with the cached failure).
 */
export const manualTopupKey = (candidate: TopupCandidate) => `topup:${candidate.account_id}:manual:${candidate.purchased_micros}:${candidate.attempts}`
