import { httpsUrl } from '@/shared/https'
import * as v from 'valibot'

/**
 * Runtime env inside Neon Functions. Neon injects DATABASE_URL, NEON_BRANCH and the AI Gateway
 * pair from the branch the function is deployed to; the rest comes from `env` in neon.ts.
 * So a function deployed to a debug branch talks to that branch's data, never main's.
 */
const FunctionEnv = v.object({
  DATABASE_URL: v.pipe(v.string(), v.url()),
  NEON_BRANCH: v.optional(v.string(), 'unknown'),
  NEON_AI_GATEWAY_TOKEN: v.optional(v.string()),
  NEON_AI_GATEWAY_BASE_URL: v.optional(httpsUrl()),
  DEFAULT_MODEL: v.optional(v.string(), 'gpt-oss-20b'),
  STRIPE_SECRET_KEY: v.optional(v.string()),
})

export const env = v.parse(FunctionEnv, process.env)
