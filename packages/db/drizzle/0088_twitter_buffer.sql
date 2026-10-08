ALTER TABLE "twitter_publish_job" RENAME COLUMN "zernio_post_id" TO "buffer_post_id";--> statement-breakpoint
ALTER TABLE "twitter_settings" RENAME COLUMN "zernio_account_id" TO "buffer_channel_id";