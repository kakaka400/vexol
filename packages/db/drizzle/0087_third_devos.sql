CREATE TABLE "obsidian_ingest_job" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"correlation_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"path" text,
	"last_error" text,
	"written_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obsidian_ingest_job_ref_unique" UNIQUE("project_id","kind","ref_id"),
	CONSTRAINT "obsidian_ingest_job_kind_check" CHECK ("obsidian_ingest_job"."kind" IN ('run', 'item', 'profile', 'draft', 'published', 'dashboard')),
	CONSTRAINT "obsidian_ingest_job_status_check" CHECK ("obsidian_ingest_job"."status" IN ('pending', 'written', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "twitter_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"event" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"correlation_id" uuid,
	"subject_type" text,
	"subject_id" text,
	"actor_user_id" text,
	"summary" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_activity_level_check" CHECK ("twitter_activity"."level" IN ('info', 'warning', 'error'))
);
--> statement-breakpoint
CREATE TABLE "twitter_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"correlation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"obsidian_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_draft_idempotency_unique" UNIQUE("project_id","idempotency_key"),
	CONSTRAINT "twitter_draft_status_check" CHECK ("twitter_draft"."status" IN ('draft', 'scheduled', 'published', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "twitter_draft_source" (
	"draft_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_draft_source_draft_id_item_id_pk" PRIMARY KEY("draft_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "twitter_draft_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"posts" jsonb NOT NULL,
	"tone" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_draft_version_unique" UNIQUE("draft_id","version")
);
--> statement-breakpoint
CREATE TABLE "twitter_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"handle" text NOT NULL,
	"name" text,
	"description" text,
	"followers" integer,
	"profile_url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"obsidian_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_profile_project_handle_unique" UNIQUE("project_id","handle")
);
--> statement-breakpoint
CREATE TABLE "twitter_publish_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"draft_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"account_id" text NOT NULL,
	"account_handle" text,
	"scheduled_for" timestamp with time zone,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"zernio_post_id" text,
	"platform_post_url" text,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone NOT NULL,
	"obsidian_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_publish_job_idempotency_unique" UNIQUE("project_id","idempotency_key"),
	CONSTRAINT "twitter_publish_job_mode_check" CHECK ("twitter_publish_job"."mode" IN ('now', 'schedule')),
	CONSTRAINT "twitter_publish_job_status_check" CHECK ("twitter_publish_job"."status" IN ('pending', 'unknown', 'scheduled', 'published', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "twitter_research_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"first_run_id" uuid,
	"post_id" text,
	"canonical_url" text NOT NULL,
	"content_hash" text NOT NULL,
	"author_handle" text NOT NULL,
	"author_name" text,
	"profile_url" text NOT NULL,
	"text" text NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"language" text,
	"metrics" jsonb,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"query" text,
	"relevance" text,
	"adapter" text NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"source_status" text DEFAULT 'ok' NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"obsidian_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_research_item_url_unique" UNIQUE("project_id","canonical_url"),
	CONSTRAINT "twitter_research_item_hash_unique" UNIQUE("project_id","content_hash"),
	CONSTRAINT "twitter_research_item_verification_check" CHECK ("twitter_research_item"."verification_status" IN ('unverified', 'verified', 'disputed')),
	CONSTRAINT "twitter_research_item_source_check" CHECK ("twitter_research_item"."source_status" IN ('ok', 'partial', 'unavailable'))
);
--> statement-breakpoint
CREATE TABLE "twitter_research_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"correlation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"step" text,
	"input" jsonb NOT NULL,
	"adapters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stop_reason" text,
	"last_error" text,
	"found_count" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"created_by" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"obsidian_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_research_run_idempotency_unique" UNIQUE("project_id","idempotency_key"),
	CONSTRAINT "twitter_research_run_kind_check" CHECK ("twitter_research_run"."kind" IN ('research', 'search', 'profile', 'post', 'ingest')),
	CONSTRAINT "twitter_research_run_status_check" CHECK ("twitter_research_run"."status" IN ('queued', 'running', 'completed', 'partial', 'stopped', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "twitter_research_run_item" (
	"run_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_research_run_item_run_id_item_id_pk" PRIMARY KEY("run_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "twitter_settings" (
	"project_id" integer PRIMARY KEY NOT NULL,
	"zernio_account_id" text,
	"default_language" text DEFAULT 'en' NOT NULL,
	"default_timezone" text DEFAULT 'Europe/Amsterdam' NOT NULL,
	"max_results" integer DEFAULT 25 NOT NULL,
	"retention_days" integer DEFAULT 90 NOT NULL,
	"tone_of_voice" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obsidian_ingest_job" ADD CONSTRAINT "obsidian_ingest_job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_activity" ADD CONSTRAINT "twitter_activity_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_activity" ADD CONSTRAINT "twitter_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_draft" ADD CONSTRAINT "twitter_draft_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_draft" ADD CONSTRAINT "twitter_draft_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_draft_source" ADD CONSTRAINT "twitter_draft_source_draft_id_twitter_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."twitter_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_draft_source" ADD CONSTRAINT "twitter_draft_source_item_id_twitter_research_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."twitter_research_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_draft_version" ADD CONSTRAINT "twitter_draft_version_draft_id_twitter_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."twitter_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_draft_version" ADD CONSTRAINT "twitter_draft_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_profile" ADD CONSTRAINT "twitter_profile_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_publish_job" ADD CONSTRAINT "twitter_publish_job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_publish_job" ADD CONSTRAINT "twitter_publish_job_draft_id_twitter_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."twitter_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_publish_job" ADD CONSTRAINT "twitter_publish_job_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_research_item" ADD CONSTRAINT "twitter_research_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_research_item" ADD CONSTRAINT "twitter_research_item_first_run_id_twitter_research_run_id_fk" FOREIGN KEY ("first_run_id") REFERENCES "public"."twitter_research_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_research_run" ADD CONSTRAINT "twitter_research_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_research_run" ADD CONSTRAINT "twitter_research_run_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_research_run_item" ADD CONSTRAINT "twitter_research_run_item_run_id_twitter_research_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."twitter_research_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_research_run_item" ADD CONSTRAINT "twitter_research_run_item_item_id_twitter_research_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."twitter_research_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_settings" ADD CONSTRAINT "twitter_settings_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "obsidian_ingest_job_due_idx" ON "obsidian_ingest_job" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "twitter_activity_project_idx" ON "twitter_activity" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "twitter_draft_project_idx" ON "twitter_draft" USING btree ("project_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "twitter_publish_job_draft_idx" ON "twitter_publish_job" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "twitter_research_item_post_unique" ON "twitter_research_item" USING btree ("project_id","post_id") WHERE "twitter_research_item"."post_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "twitter_research_item_project_idx" ON "twitter_research_item" USING btree ("project_id","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "twitter_research_run_project_idx" ON "twitter_research_run" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "twitter_research_run_due_idx" ON "twitter_research_run" USING btree ("status","next_attempt_at");