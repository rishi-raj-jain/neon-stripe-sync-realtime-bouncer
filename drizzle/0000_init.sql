CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."experiment_status" AS ENUM('open', 'shipped', 'discarded');--> statement-breakpoint
CREATE TABLE "app"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"label" text NOT NULL,
	"stripe_customer_id" text,
	"auto_topup_enabled" boolean DEFAULT false NOT NULL,
	"auto_topup_threshold_micros" bigint DEFAULT 5000000 NOT NULL,
	"auto_topup_amount_cents" integer DEFAULT 1000 NOT NULL,
	"auto_topup_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "accounts_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "accounts_topup_amount_check" CHECK ("app"."accounts"."auto_topup_amount_cents" >= 500)
);
--> statement-breakpoint
CREATE TABLE "app"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "app"."experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"branch_id" text NOT NULL,
	"branch_name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"status" "app"."experiment_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "experiments_branch_id_unique" UNIQUE("branch_id")
);
--> statement-breakpoint
CREATE TABLE "app"."model_costs" (
	"model" text PRIMARY KEY NOT NULL,
	"input_usd_per_mtok" numeric(12, 4) NOT NULL,
	"cached_input_usd_per_mtok" numeric(12, 4) NOT NULL,
	"output_usd_per_mtok" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."model_rates" (
	"model" text PRIMARY KEY NOT NULL,
	"input_usd_per_mtok" numeric(12, 4) NOT NULL,
	"cached_input_usd_per_mtok" numeric(12, 4) NOT NULL,
	"output_usd_per_mtok" numeric(12, 4) NOT NULL,
	"reasoning_usd_per_mtok" numeric(12, 4) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."rate_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"experiment_id" uuid,
	"changed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"invoice_id" text,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topups_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
CREATE TABLE "app"."usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"api_key_id" uuid,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"price_micros" bigint NOT NULL,
	"cost_micros" bigint NOT NULL,
	"status" smallint NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."api_keys" ADD CONSTRAINT "api_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rate_changes" ADD CONSTRAINT "rate_changes_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "app"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."topups" ADD CONSTRAINT "topups_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."usage_events" ADD CONSTRAINT "usage_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."usage_events" ADD CONSTRAINT "usage_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "app"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_account_idx" ON "app"."api_keys" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "topups_account_created_idx" ON "app"."topups" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_account_price_idx" ON "app"."usage_events" USING btree ("account_id","price_micros");--> statement-breakpoint
CREATE INDEX "usage_account_created_idx" ON "app"."usage_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_created_idx" ON "app"."usage_events" USING btree ("created_at");