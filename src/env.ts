import 'server-only'

import { httpsUrl } from '@/shared/https'
import * as v from 'valibot'

/**
 * Server env for the Next.js app, validated once at module load.
 * Locally, `neon deploy` / `neon env pull` write the Neon-managed vars into `.env`.
 */
const url = v.pipe(v.string(), v.url())

// Everything the app talks to is https in production. DATABASE_URL is postgresql://, but the
// Neon serverless driver always sends queries over HTTPS (fetch), so there is no plaintext path.
const ServerEnv = v.object({
  DATABASE_URL: url,
  NEON_AUTH_BASE_URL: httpsUrl(),
  NEON_AUTH_COOKIE_SECRET: v.pipe(v.string(), v.minLength(32, 'NEON_AUTH_COOKIE_SECRET must be at least 32 chars (openssl rand -base64 32)')),
  STRIPE_SECRET_KEY: v.pipe(v.string(), v.regex(/^(sk|rk)_(test|live)_/, 'STRIPE_SECRET_KEY must be a secret or restricted key')),
  /** Checkout success/cancel URLs and absolute metadata URLs are built from it. */
  APP_URL: httpsUrl({ allowLocalHttp: true }),
  /** Where customers send API calls: the `api` function's URL, or its custom domain. */
  API_BASE_URL: v.optional(httpsUrl({ allowLocalHttp: true })),
  /** Shared demo login behind the "Try the demo account" button. Server-side only. */
  DEMO_USERNAME: v.optional(v.pipe(v.string(), v.regex(/^[a-zA-Z0-9_.-]{3,30}$/)), 'Phoenix'),
  DEMO_PASSWORD: v.optional(v.pipe(v.string(), v.minLength(8, 'DEMO_PASSWORD must be at least 8 characters'))),
  /** Prefilled in Stripe Checkout for the demo account (its login has no real email). */
  DEMO_EMAIL: v.optional(v.pipe(v.string(), v.email('DEMO_EMAIL must be an email address')), 'demo@example.com'),
})

type ServerEnv = v.InferOutput<typeof ServerEnv>

function appUrl(e: NodeJS.ProcessEnv): string {
  if (e.APP_URL) return e.APP_URL
  if (e.VERCEL_ENV === 'production' && e.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (e.VERCEL_URL) return `https://${e.VERCEL_URL}`
  return 'http://localhost:3000'
}

function parseServerEnv(e: NodeJS.ProcessEnv): ServerEnv {
  const result = v.safeParse(ServerEnv, {
    DATABASE_URL: e.DATABASE_URL,
    NEON_AUTH_BASE_URL: e.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: e.NEON_AUTH_COOKIE_SECRET,
    STRIPE_SECRET_KEY: e.STRIPE_SECRET_KEY,
    APP_URL: appUrl(e),
    // A custom domain wins over the function URL that `neon deploy` writes.
    API_BASE_URL: e.API_BASE_URL || e.NEON_FUNCTION_API_BASE_URL || undefined,
    DEMO_USERNAME: e.DEMO_USERNAME || undefined,
    DEMO_PASSWORD: e.DEMO_PASSWORD || undefined,
    DEMO_EMAIL: e.DEMO_EMAIL || undefined,
  })

  if (!result.success) {
    const issues = Object.entries(v.flatten<typeof ServerEnv>(result.issues).nested ?? {})
      .map(([key, messages]) => `  - ${key}: ${messages?.join(', ')}`)
      .join('\n')
    throw new Error(`Invalid server environment:\n${issues}`)
  }
  return result.output
}

export const env = parseServerEnv(process.env)
