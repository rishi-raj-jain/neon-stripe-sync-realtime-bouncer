import { APP_TAG } from '@/shared/pricing'
import type Stripe from 'stripe'

/**
 * Adds credits to an account the server-initiated way (auto top-ups, demo seed): a Stripe
 * invoice for the credit amount, with the promotion code applied when purchases are free.
 *
 *   free (100% off) → finalizing a $0 invoice marks it paid; no card, no charge
 *   paid            → charged off-session to `paymentMethod` (the card from the latest charge)
 *
 * Either way the invoice syncs into stripe.invoices / stripe.charges and app.balances counts it
 * at face value (metadata.credits_cents). Every call is idempotent per `key`.
 */
export async function createCreditInvoice(
  stripe: Stripe,
  input: { customer: string; amountCents: number; promotionCodeId: string | null; paymentMethod?: string | null; key: string; metadata: Record<string, string> },
): Promise<Stripe.Invoice> {
  const { customer, amountCents, promotionCodeId, paymentMethod, key } = input
  const metadata = { app: APP_TAG, ...input.metadata, credits_cents: String(amountCents) }

  const invoice = await stripe.invoices.create(
    {
      customer,
      currency: 'usd',
      collection_method: 'charge_automatically',
      auto_advance: false,
      pending_invoice_items_behavior: 'exclude',
      description: 'Bouncer moderation credits',
      metadata,
      ...(promotionCodeId && { discounts: [{ promotion_code: promotionCodeId }] }),
      ...(paymentMethod && { default_payment_method: paymentMethod }),
    },
    { idempotencyKey: `${key}:invoice` },
  )
  await stripe.invoiceItems.create({ customer, invoice: invoice.id, amount: amountCents, currency: 'usd', description: 'Bouncer moderation credits', metadata }, { idempotencyKey: `${key}:item` })
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false }, { idempotencyKey: `${key}:finalize` })
  if (finalized.status === 'paid') return finalized
  return stripe.invoices.pay(invoice.id, { off_session: true }, { idempotencyKey: `${key}:pay` })
}
