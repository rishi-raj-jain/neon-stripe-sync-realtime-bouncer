import '@dotenvx/dotenvx/config'

import { defineConfig } from '@neon/config/v1'
// Neon's config loader doesn't read tsconfig paths, so this one import stays relative.
import { DEFAULT_MODEL } from './src/shared/pricing'

/**
 * Infrastructure for Bouncer, applied with `neon deploy`.
 *
 * Project region: AWS US East (Ohio) / aws-us-east-2, next to Vercel's cle1, where
 * Functions and AI Gateway are available.
 *
 * The Stripe → Postgres pipeline is NOT declared here: connect it once in the Stripe
 * Dashboard (Data management → Pipelines → Neon). Stripe owns the `stripe` schema.
 */
const apiDomains = process.env.API_CUSTOM_DOMAIN ? [process.env.API_CUSTOM_DOMAIN] : undefined

export default defineConfig({
  // Managed Better Auth for the dashboard: users + sessions live in the `neon_auth` schema.
  auth: true,
  // The model behind the moderation service. No provider keys: the gateway token is injected per branch.
  aiGateway: true,
  functions: {
    // Slugs must match ^[a-z0-9]{1,20}$ and can't change after the first deploy.
    api: {
      name: 'Moderation API, billed per item',
      source: './functions/api.ts',
      env: { DEFAULT_MODEL },
      // e.g. API_CUSTOM_DOMAIN=api.bouncer.dev → customers call https://api.bouncer.dev/v1/moderate
      customDomains: apiDomains,
      dev: { port: 8787 },
    },
    topups: {
      name: 'Auto top-ups with the saved card',
      source: './functions/topups.ts',
      // Writes go through Stripe's API; the resulting charge syncs back via the pipeline.
      env: { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '' },
      dev: { port: 8788 },
    },
  },
  triggers: {
    // Fires even when the database compute is scaled to zero.
    'auto-topups': {
      type: 'schedule',
      function: 'topups',
      cron: '*/5 * * * *',
    },
  },
  branch: (branch) => {
    if (branch.isDefault) return { protected: true }
    if (!branch.exists) {
      // Debug and preview branches: tiny and auto-expiring. Inherited triggers start
      // disabled, so a branch never charges anyone's card unless you deploy to it.
      return {
        ttl: '7d',
        postgres: { computeSettings: { autoscalingLimitMinCu: 0.25, autoscalingLimitMaxCu: 1, suspendTimeout: '5m' } },
      }
    }
    return {}
  },
})
