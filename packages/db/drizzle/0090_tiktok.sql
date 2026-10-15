CREATE TABLE "tiktok_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"template_id" uuid,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style" text DEFAULT '' NOT NULL,
	"duration_seconds" integer DEFAULT 15 NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"video_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiktok_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"draft_id" uuid,
	"idempotency_key" text NOT NULL,
	"caption" text NOT NULL,
	"video_url" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text,
	"mode" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"buffer_post_id" text,
	"platform_post_url" text,
	"last_error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiktok_post_idempotency_unique" UNIQUE("project_id","idempotency_key"),
	CONSTRAINT "tiktok_post_mode_check" CHECK ("tiktok_post"."mode" IN ('now', 'schedule')),
	CONSTRAINT "tiktok_post_status_check" CHECK ("tiktok_post"."status" IN ('pending', 'unknown', 'scheduled', 'published', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "tiktok_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style" text DEFAULT '' NOT NULL,
	"duration_seconds" integer DEFAULT 15 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tiktok_draft" ADD CONSTRAINT "tiktok_draft_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_draft" ADD CONSTRAINT "tiktok_draft_template_id_tiktok_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tiktok_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_draft" ADD CONSTRAINT "tiktok_draft_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_post" ADD CONSTRAINT "tiktok_post_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_post" ADD CONSTRAINT "tiktok_post_draft_id_tiktok_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."tiktok_draft"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_post" ADD CONSTRAINT "tiktok_post_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_template" ADD CONSTRAINT "tiktok_template_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tiktok_draft_project_idx" ON "tiktok_draft" USING btree ("project_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tiktok_post_project_idx" ON "tiktok_post" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tiktok_template_project_idx" ON "tiktok_template" USING btree ("project_id","updated_at" DESC NULLS LAST);