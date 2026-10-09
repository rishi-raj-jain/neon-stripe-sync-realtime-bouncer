import { ensureAccount } from '@/lib/accounts'
import { getUser, unauthorized } from '@/lib/auth/server'
import { simulateSpend } from '@/lib/billing'
import * as v from 'valibot'

const Body = v.variant('kind', [v.object({ kind: v.literal('amount'), cents: v.picklist([100, 500]) }), v.object({ kind: v.literal('below-threshold') })])

/**
 * POST /api/usage/simulate  { kind: 'amount', cents } | { kind: 'below-threshold' }  →  { spentMicros }
 *
 * Spends your own credits on paper, with no AI Gateway call (so it costs nothing), to show auto
 * top-up working: the balance drops, and the `topups` function tops it up on its next run.
 * Never counts toward the daily request limit; never takes a balance below zero.
 */
export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return unauthorized()

  const parsed = v.safeParse(Body, await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid simulation' }, { status: 400 })

  const account = await ensureAccount(user)
  const spentMicros = await simulateSpend(account.id, parsed.output)
  if (spentMicros === 0) {
    return Response.json({ error: parsed.output.kind === 'below-threshold' ? 'Your balance is already below the threshold.' : 'Your balance is empty.' }, { status: 409 })
  }
  return Response.json({ spentMicros })
}
