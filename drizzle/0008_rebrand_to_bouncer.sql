-- Renamed to Bouncer: the database objects that carried the app's first name.
-- A fresh install already creates the bouncer_* indexes (0002), so on it every statement here
-- is a no-op; on a database that ran the old migrations they rename in place.

-- Lookup indexes on the Stripe-synced tables (same definitions, new names).
ALTER INDEX IF EXISTS "stripe"."tollbooth_charges_customer_created_idx" RENAME TO "bouncer_charges_customer_created_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "stripe"."tollbooth_checkout_sessions_customer_created_idx" RENAME TO "bouncer_checkout_sessions_customer_created_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "stripe"."tollbooth_invoices_customer_created_idx" RENAME TO "bouncer_invoices_customer_created_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "stripe"."tollbooth_promotion_codes_code_idx" RENAME TO "bouncer_promotion_codes_code_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "stripe"."tollbooth_prices_lookup_key_idx" RENAME TO "bouncer_prices_lookup_key_idx";--> statement-breakpoint

-- Username logins: a username signs in as <username>@users.bouncer.invalid now
-- (src/lib/auth/username.ts), so existing users move to that address. Passwords live on the
-- credential account, keyed by user id, so they keep working. Skipped where Neon Auth isn't set up.
DO $$
BEGIN
  IF to_regclass('neon_auth."user"') IS NOT NULL THEN
    UPDATE neon_auth."user"
       SET email = replace(email, '@users.tollbooth.invalid', '@users.bouncer.invalid')
     WHERE email LIKE '%@users.tollbooth.invalid';
  END IF;
END
$$;
