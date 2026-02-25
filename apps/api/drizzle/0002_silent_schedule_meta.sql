ALTER TABLE "schedules" ADD COLUMN "name" text NOT NULL DEFAULT 'Untitled schedule';--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "name" DROP DEFAULT;
