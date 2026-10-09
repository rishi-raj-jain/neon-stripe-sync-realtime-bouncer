import { ensureAccount } from '@/lib/accounts'
import { getUser, unauthorized } from '@/lib/auth/server'
import { updateAutoTopup } from '@/lib/billing'
import { TOPUP_AMOUNTS_CENTS, TOPUP_THRESHOLDS_CENTS } from '@/shared/pricing'
import * as v from 'valibot'

const Settings = v.object({
  enabled: v.boolean(),
  thresholdCents: v.picklist(TOPUP_THRESHOLDS_CENTS),
  amountCents: v.picklist(TOPUP_AMOUNTS_CENTS),
})

/**
 * PUT /api/account/auto-topup  { enabled, thresholdCents, amountCents }
 *
 * Saves the settings the `topups` function reads every 5 minutes. It charges the card from the
 * account's latest successful payment, so buy credits once before turning this on.
 */
export async function PUT(request: Request) {
  const user = await getUser()
  if (!user) return unauthorized()

  const parsed = v.safeParse(Settings, await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid auto top-up settings' }, { status: 400 })

  const account = await ensureAccount(user)
  await updateAutoTopup(account.id, parsed.output)
  return Response.json({ ok: true })
}
