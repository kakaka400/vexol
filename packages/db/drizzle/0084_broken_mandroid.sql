CREATE TABLE "studio_post" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"instruction" text NOT NULL,
	"image_file_id" integer,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_post_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "studio_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"photo_file_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_template_project_slot_unique" UNIQUE("project_id","slot"),
	CONSTRAINT "studio_template_slot_check" CHECK ("studio_template"."slot" BETWEEN 1 AND 6)
);
--> statement-breakpoint
ALTER TABLE "studio_post" ADD CONSTRAINT "studio_post_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_post" ADD CONSTRAINT "studio_post_template_id_studio_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."studio_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_post" ADD CONSTRAINT "studio_post_image_file_id_project_file_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."project_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_post" ADD CONSTRAINT "studio_post_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_template" ADD CONSTRAINT "studio_template_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_template" ADD CONSTRAINT "studio_template_photo_file_id_project_file_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."project_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_post_project_idx" ON "studio_post" USING btree ("project_id","created_at");