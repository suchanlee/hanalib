CREATE TABLE `web_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint_hash` text NOT NULL,
	`subscription_encrypted` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_delivered_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`disabled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `web_push_subscriptions_endpoint_hash_unique` ON `web_push_subscriptions` (`endpoint_hash`);--> statement-breakpoint
CREATE INDEX `web_push_subscriptions_user_active_idx` ON `web_push_subscriptions` (`user_id`) WHERE "web_push_subscriptions"."disabled_at" IS NULL;