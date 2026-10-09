import { auth } from '@/lib/auth/server'

/** Proxies Managed Better Auth (sign-in, sign-up, session) through our own origin. */
export const { GET, POST } = auth.handler()
