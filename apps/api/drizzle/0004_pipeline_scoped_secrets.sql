ALTER TABLE "user_secrets"
ADD COLUMN "pipeline_id" uuid;
--> statement-breakpoint

ALTER TABLE "user_secrets"
ADD CONSTRAINT "user_secrets_pipeline_id_pipelines_id_fk"
FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

DROP INDEX IF EXISTS "user_secrets_user_name";
--> statement-breakpoint

CREATE UNIQUE INDEX "user_secrets_user_global_name"
ON "user_secrets" USING btree ("user_id", "name")
WHERE "pipeline_id" IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "user_secrets_user_pipeline_name"
ON "user_secrets" USING btree ("user_id", "pipeline_id", "name")
WHERE "pipeline_id" IS NOT NULL;
