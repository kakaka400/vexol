CREATE TABLE "studio_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"conversation_id" uuid,
	"platform" text DEFAULT 'instagram' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_draft_idempotency_unique" UNIQUE("project_id","idempotency_key"),
	CONSTRAINT "studio_draft_platform_check" CHECK ("studio_draft"."platform" IN ('instagram')),
	CONSTRAINT "studio_draft_status_check" CHECK ("studio_draft"."status" IN ('draft', 'review_requested', 'approved', 'rejected', 'scheduled'))
);
--> statement-breakpoint
CREATE TABLE "studio_draft_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"caption" text NOT NULL,
	"template_slot" integer,
	"post_id" integer,
	"content_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_draft_version_unique" UNIQUE("draft_id","version"),
	CONSTRAINT "studio_draft_version_slot_check" CHECK ("studio_draft_version"."template_slot" BETWEEN 1 AND 6)
);
--> statement-breakpoint
CREATE TABLE "studio_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_review_version_id_unique" UNIQUE("version_id"),
	CONSTRAINT "studio_review_id_decision_unique" UNIQUE("id","decision"),
	CONSTRAINT "studio_review_decision_check" CHECK ("studio_review"."decision" IN ('approved', 'rejected')),
	CONSTRAINT "studio_review_reason_check" CHECK ("studio_review"."decision" = 'approved' OR "studio_review"."reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "studio_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"review_decision" text DEFAULT 'approved' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_schedule_review_id_unique" UNIQUE("review_id"),
	CONSTRAINT "studio_schedule_approved_check" CHECK ("studio_schedule"."review_decision" = 'approved')
);
--> statement-breakpoint
ALTER TABLE "studio_draft" ADD CONSTRAINT "studio_draft_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_draft" ADD CONSTRAINT "studio_draft_conversation_id_hermes_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."hermes_conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_draft" ADD CONSTRAINT "studio_draft_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_draft_version" ADD CONSTRAINT "studio_draft_version_draft_id_studio_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."studio_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_draft_version" ADD CONSTRAINT "studio_draft_version_post_id_studio_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."studio_post"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_draft_version" ADD CONSTRAINT "studio_draft_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_review" ADD CONSTRAINT "studio_review_version_id_studio_draft_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."studio_draft_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_review" ADD CONSTRAINT "studio_review_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_schedule" ADD CONSTRAINT "studio_schedule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_schedule" ADD CONSTRAINT "studio_schedule_review_fk" FOREIGN KEY ("review_id","review_decision") REFERENCES "public"."studio_review"("id","decision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_draft_project_idx" ON "studio_draft" USING btree ("project_id","updated_at" DESC NULLS LAST);