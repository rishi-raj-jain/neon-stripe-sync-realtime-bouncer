import 'server-only'

import { db } from '@/db/client'
import { apiKeys } from '@/db/schema/app'
import { API_KEY_PREFIX, API_KEY_VISIBLE_CHARS } from '@/shared/pricing'
import { and, eq, isNull } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'

/** SHA-256, hex. The `api` function hashes the presented key the same way to look it up. */
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex')

/** A new key. The plaintext is returned once and never stored. */
export async function createKey(accountId: string, name: string) {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
  const [row] = await db
    .insert(apiKeys)
    .values({ accountId, name, prefix: key.slice(0, API_KEY_PREFIX.length + API_KEY_VISIBLE_CHARS), keyHash: hashKey(key) })
    .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt })
  if (!row) throw new Error('failed to create the API key')
  return { key, row: { ...row, createdAt: row.createdAt.toISOString(), lastUsedAt: null } }
}

/** Revoked keys stop working on the next request; their usage history stays. */
export async function revokeKey(accountId: string, keyId: string): Promise<boolean> {
  const revoked = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.accountId, accountId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id })
  return revoked.length > 0
}
