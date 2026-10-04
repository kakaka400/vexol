ALTER TABLE "studio_schedule" ADD COLUMN "targets" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_schedule" ADD COLUMN "zernio_post_id" text;