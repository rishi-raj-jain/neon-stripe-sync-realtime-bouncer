import { ensureAccount } from '@/lib/accounts'
import { getUser, unauthorized } from '@/lib/auth/server'
import { getDashboard } from '@/lib/billing'

/**
 * GET /api/account  →  { wallet, card, purchases, autoTopup, keys, usage }
 *
 * Polled by the dashboard after Checkout and after playground calls. The new charge appears a
 * few seconds after payment, straight from the Stripe-synced tables. One database round trip.
 */
export async function GET() {
  const user = await getUser()
  if (!user) return unauthorized()
  return Response.json(await getDashboard(await ensureAccount(user)))
}
