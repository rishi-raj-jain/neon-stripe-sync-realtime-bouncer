import 'server-only'

import { env } from '@/env'
import { createNeonAuth } from '@neondatabase/auth/next/server'

export const auth = createNeonAuth({
  baseUrl: env.NEON_AUTH_BASE_URL,
  cookies: { secret: env.NEON_AUTH_COOKIE_SECRET },
})

export type SessionUser = { id: string; email: string; name: string }

/** The signed-in user, or null. Use in API routes and server components. */
export async function getUser(): Promise<SessionUser | null> {
  const { data: session } = await auth.getSession()
  if (!session?.user) return null
  const { id, email, name } = session.user
  return { id, email, name }
}

export function unauthorized() {
  return Response.json({ error: 'unauthorized' }, { status: 401 })
}
