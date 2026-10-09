import '@dotenvx/dotenvx/config'

import { defineConfig } from 'drizzle-kit'
import * as v from 'valibot'

// Schema work (generate, migrate, studio) uses the direct connection, not the pooler.
const { DATABASE_URL_UNPOOLED } = v.parse(
  v.object({
    DATABASE_URL_UNPOOLED: v.pipe(v.string('DATABASE_URL_UNPOOLED is required for schema work (neon env pull)'), v.url()),
  }),
  process.env,
)

export default defineConfig({
  dialect: 'postgresql',
  // Only the app schema. src/db/schema/stripe.ts is deliberately excluded: Stripe owns it.
  schema: './src/db/schema/app.ts',
  out: './drizzle',
  schemaFilter: ['app'],
  dbCredentials: { url: DATABASE_URL_UNPOOLED },
  strict: true,
  verbose: true,
})
