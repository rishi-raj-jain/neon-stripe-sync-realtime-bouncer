import { ensureAccount } from '@/lib/accounts'
import { getUser, unauthorized } from '@/lib/auth/server'
import { createKey } from '@/lib/keys'
import * as v from 'valibot'

const NewKey = v.object({ name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Name the key.'), v.maxLength(60)) })

/**
 * POST /api/keys  { name }  →  { key, row }
 *
 * The plaintext key comes back exactly once. Only its SHA-256 is stored.
 */
export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return unauthorized()

  const parsed = v.safeParse(NewKey, await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: parsed.issues[0]?.message ?? 'invalid key' }, { status: 400 })

  const account = await ensureAccount(user)
  return Response.json(await createKey(account.id, parsed.output.name), { status: 201 })
}
