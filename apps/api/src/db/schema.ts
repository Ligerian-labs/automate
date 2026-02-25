import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  plan: text("plan").default("free").notNull(),
  creditsRemaining: integer("credits_remaining").default(100).notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  name: text("name"),
  scopes: text("scopes")
    .array()
    .default(["pipelines:read", "pipelines:execute"]),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userSecrets = pgTable(
  "user_secrets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    encryptedValue: text("encrypted_value").notNull(), // base64-encoded AES-256-GCM ciphertext (see ENCRYPTION.md §4.1)
    keyVersion: integer("key_version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_secrets_user_name").on(table.userId, table.name),
  ],
);

export const pipelines = pgTable("pipelines", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  definition: jsonb("definition").notNull(),
  version: integer("version").default(1).notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  tags: text("tags").array().default([]),
  status: text("status").default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const pipelineVersions = pgTable(
  "pipeline_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pipelineId: uuid("pipeline_id")
      .references(() => pipelines.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull(),
    definition: jsonb("definition").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("pipeline_version_unique").on(table.pipelineId, table.version),
  ],
);

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pipelineId: uuid("pipeline_id")
      .references(() => pipelines.id, { onDelete: "cascade" })
      .notNull(),
    cronExpression: text("cron_expression").notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    inputData: jsonb("input_data").default({}).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("schedules_next_run").on(table.nextRunAt)],
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pipelineId: uuid("pipeline_id")
      .references(() => pipelines.id, { onDelete: "cascade" })
      .notNull(),
    pipelineVersion: integer("pipeline_version").notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    triggerType: text("trigger_type").notNull(),
    status: text("status").default("pending").notNull(),
    inputData: jsonb("input_data").default({}).notNull(),
    outputData: jsonb("output_data"),
    error: text("error"),
    totalTokens: integer("total_tokens").default(0).notNull(),
    totalCostCents: integer("total_cost_cents").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("runs_pipeline").on(table.pipelineId),
    index("runs_user").on(table.userId),
    index("runs_status").on(table.status),
  ],
);

export const stepExecutions = pgTable(
  "step_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .references(() => runs.id, { onDelete: "cascade" })
      .notNull(),
    stepId: text("step_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    model: text("model"),
    status: text("status").default("pending").notNull(),
    promptSent: text("prompt_sent"),
    rawOutput: text("raw_output"),
    parsedOutput: jsonb("parsed_output"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    costCents: integer("cost_cents").default(0).notNull(),
    durationMs: integer("duration_ms"),
    error: text("error"),
    retryCount: integer("retry_count").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("step_exec_run").on(table.runId)],
);
