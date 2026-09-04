CREATE TABLE `book_editions` (
	`id` text PRIMARY KEY NOT NULL,
	`isbn10` text,
	`isbn13` text,
	`title` text NOT NULL,
	`subtitle` text,
	`authors_json` text DEFAULT '[]' NOT NULL,
	`publisher` text,
	`published_on` text,
	`language` text,
	`page_count` integer,
	`description` text,
	`cover_source_url` text,
	`cover_storage_path` text,
	`field_provenance_json` text DEFAULT '{}' NOT NULL,
	`resolver_version` integer DEFAULT 1 NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_editions_isbn13_unique` ON `book_editions` (`isbn13`);--> statement-breakpoint
CREATE INDEX `book_editions_title_idx` ON `book_editions` (`title`);--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`edition_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`condition` text DEFAULT 'good' NOT NULL,
	`owner_notes` text,
	`archived_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`edition_id`) REFERENCES `book_editions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `catalog_items_community_status_idx` ON `catalog_items` (`community_id`,`status`);--> statement-breakpoint
CREATE INDEX `catalog_items_owner_idx` ON `catalog_items` (`owner_id`);--> statement-breakpoint
CREATE TABLE `communities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_locale` text DEFAULT 'ko' NOT NULL,
	`timezone` text DEFAULT 'America/Los_Angeles' NOT NULL,
	`registration_mode` text DEFAULT 'open' NOT NULL,
	`request_expiry_hours` integer DEFAULT 48 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `community_members` (
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_members_unique` ON `community_members` (`community_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `loan_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`catalog_item_id` text NOT NULL,
	`requester_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`responded_at` integer,
	`responded_by` text,
	`sms_actionable_at` integer,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requester_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responded_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_requests_idempotency_unique` ON `loan_requests` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `loan_requests_item_status_idx` ON `loan_requests` (`catalog_item_id`,`status`);--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`catalog_item_id` text NOT NULL,
	`request_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`borrower_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` integer NOT NULL,
	`next_check_at` integer NOT NULL,
	`last_check_at` integer,
	`returned_at` integer,
	`returned_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `loan_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`borrower_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`returned_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `loans_item_status_idx` ON `loans` (`catalog_item_id`,`status`);--> statement-breakpoint
CREATE TABLE `notification_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`address_encrypted` text NOT NULL,
	`address_hash` text NOT NULL,
	`verified_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`locale` text NOT NULL,
	`payload_json` text NOT NULL,
	`available_at` integer NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`processed_at` integer,
	FOREIGN KEY (`recipient_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `outbox_ready_idx` ON `outbox_events` (`processed_at`,`available_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`display_name_ko` text NOT NULL,
	`avatar_url` text,
	`locale` text DEFAULT 'ko' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
