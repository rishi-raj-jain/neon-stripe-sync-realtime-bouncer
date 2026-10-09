import { ensureAccount } from '@/lib/accounts'
import { getUser, unauthorized } from '@/lib/auth/server'
import { revokeKey } from '@/lib/keys'
import * as v from 'valibot'

const KeyId = v.pipe(v.string(), v.uuid())

/** DELETE /api/keys/:id   Revokes one of your keys. Its usage history stays. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return unauthorized()

  const id = v.safeParse(KeyId, (await params).id)
  if (!id.success) return Response.json({ error: 'not found' }, { status: 404 })

  const account = await ensureAccount(user)
  const revoked = await revokeKey(account.id, id.output)
  return revoked ? new Response(null, { status: 204 }) : Response.json({ error: 'not found' }, { status: 404 })
}
