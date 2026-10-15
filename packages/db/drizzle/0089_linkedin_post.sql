CREATE TABLE "linkedin_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"text" text NOT NULL,
	"image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
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
	CONSTRAINT "linkedin_post_idempotency_unique" UNIQUE("project_id","idempotency_key"),
	CONSTRAINT "linkedin_post_mode_check" CHECK ("linkedin_post"."mode" IN ('now', 'schedule')),
	CONSTRAINT "linkedin_post_status_check" CHECK ("linkedin_post"."status" IN ('pending', 'unknown', 'scheduled', 'published', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "linkedin_post" ADD CONSTRAINT "linkedin_post_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post" ADD CONSTRAINT "linkedin_post_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "linkedin_post_project_idx" ON "linkedin_post" USING btree ("project_id","created_at" DESC NULLS LAST);