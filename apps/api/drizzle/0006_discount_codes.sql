CREATE TABLE "billing_discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"kind" text NOT NULL,
	"percent_off" integer,
	"free_cycles_count" integer,
	"free_cycles_interval" text,
	"applies_to_plan" text,
	"applies_to_interval" text,
	"allowed_emails" text[] DEFAULT '{}' NOT NULL,
	"max_redemptions" integer,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"stripe_coupon_id" text,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE INDEX "billing_discount_codes_code" ON "billing_discount_codes" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "billing_discount_codes_active" ON "billing_discount_codes" USING btree ("active");
