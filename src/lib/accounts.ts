import 'server-only'

import { db } from '@/db/client'
import { accounts, type Account } from '@/db/schema/app'
import type { SessionUser } from '@/lib/auth/server'
import { emailToUsername } from '@/lib/auth/username'

/**
 * The signed-in user's account, created on first visit. One round trip either way: an upsert
 * that also keeps the label in step with the username.
 */
export async function ensureAccount(user: SessionUser): Promise<Account> {
  const label = emailToUsername(user.email) ?? user.name
  const [account] = await db.insert(accounts).values({ userId: user.id, label }).onConflictDoUpdate({ target: accounts.userId, set: { label } }).returning()
  if (!account) throw new Error(`failed to load the account for ${user.id}`)
  return account
}
