CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expires_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
ALTER TABLE `catalog_items` ADD `metadata_overrides_json` text;--> statement-breakpoint
ALTER TABLE `catalog_items` ADD `cover_source_override_url` text;