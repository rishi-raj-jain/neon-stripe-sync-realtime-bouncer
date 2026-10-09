import { ensureAccount } from '@/lib/accounts'
import { getUser, unauthorized } from '@/lib/auth/server'
import { topUpNow } from '@/lib/billing'

/**
 * POST /api/account/auto-topup/run  →  { status, invoiceId }
 *
 * Runs the auto top-up for your account now instead of waiting for the `topups` function's next
 * scheduled run: same rules (balance under the threshold, the saved amount), same Stripe invoice,
 * same app.topups row. The invoice syncs back and the balance view counts it.
 */
export async function POST() {
  const user = await getUser()
  if (!user) return unauthorized()

  const account = await ensureAccount(user)
  const result = await topUpNow(account.id)
  if (!result) return Response.json({ error: 'Nothing to top up: the balance is at or above the threshold, or the last top-up is still syncing.' }, { status: 409 })
  if (result.status === 'failed') return Response.json({ error: result.error ?? 'Top-up failed.' }, { status: 502 })
  return Response.json({ status: result.status, invoiceId: result.invoiceId })
}
