CREATE TABLE `description_jobs` (
	`item_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`lease_token` text,
	`outcome` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `description_jobs_ready_idx` ON `description_jobs` (`status`,`available_at`);