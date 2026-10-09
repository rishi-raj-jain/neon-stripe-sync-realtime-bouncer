import '@dotenvx/dotenvx/config'

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import * as v from 'valibot'

/**
 * Applies ./drizzle migrations with the Neon serverless driver (HTTP) over the direct
 * (unpooled) connection. App code uses the pooled DATABASE_URL; schema work never does.
 * Runs against whatever branch `.env` points at: `neon checkout <branch>` switches it.
 *
 * The wallet view and the lookup indexes need the Stripe-synced tables, so connect the
 * Stripe pipeline before running this.
 */
const env = v.parse(
  v.object({
    DATABASE_URL_UNPOOLED: v.pipe(v.string('DATABASE_URL_UNPOOLED is required for schema work (neon env pull)'), v.url()),
    NEON_BRANCH: v.optional(v.string(), '(unknown branch)'),
  }),
  process.env,
)

const sql = neon(env.DATABASE_URL_UNPOOLED)
const STRIPE_TABLES = ['customers', 'charges', 'checkout_sessions', 'invoices', 'prices', 'promotion_codes']

const [{ exists: stripeSynced }] = (await sql`
  select exists (
    select 1 from information_schema.tables
     where table_schema = 'stripe' and table_name = any(${STRIPE_TABLES})
     group by table_schema having count(*) = ${STRIPE_TABLES.length}
  ) as exists
`) as [{ exists: boolean }]

if (!stripeSynced) {
  console.error(
    `Missing Stripe-synced tables (need stripe.${STRIPE_TABLES.join(', stripe.')}).\n` +
      'Connect Stripe → Data management → Pipelines → Neon, enable those tables, wait for the\n' +
      'backfill to start, then re-run. (Schema name must be `stripe`.)',
  )
  process.exit(1)
}

console.log(`Migrating ${env.NEON_BRANCH}…`)
await migrate(drizzle({ client: sql }), {
  migrationsFolder: './drizzle',
})
console.log('Done.')
