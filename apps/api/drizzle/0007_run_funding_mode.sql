ALTER TABLE "runs" ADD COLUMN "funding_mode" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "credits_deducted" integer DEFAULT 0 NOT NULL;
