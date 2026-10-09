-- The pricing lab is gone: its tables, its enum and its view.
DROP TABLE "app"."experiments" CASCADE;--> statement-breakpoint
DROP TABLE "app"."rate_changes" CASCADE;--> statement-breakpoint
DROP TYPE "app"."experiment_status";--> statement-breakpoint
DROP VIEW IF EXISTS "app"."rate_impact_30d";--> statement-breakpoint

-- The seeded demo customers only fed the lab's margin report. Real accounts always have a login
-- (user_id); their usage and top-ups go with them (ON DELETE CASCADE).
DELETE FROM "app"."accounts" WHERE "user_id" IS NULL;--> statement-breakpoint

-- Launch pricing undercharged reasoning tokens on purpose (the lab's planted leak). Without the
-- lab that's just a loss, so reasoning is priced like the rest of the output (3× its cost).
UPDATE "app"."model_rates" SET "reasoning_usd_per_mtok" = "output_usd_per_mtok", "updated_at" = now() WHERE "reasoning_usd_per_mtok" < "output_usd_per_mtok";
