import 'server-only'

import { env } from '@/env'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

/**
 * Neon serverless driver over HTTP: one round trip per query, no pool to manage, which
 * suits Vercel Functions in cle1 talking to a Neon project in aws-us-east-2.
 */
export const sql = neon(env.DATABASE_URL)
export const db = drizzle({ client: sql })
