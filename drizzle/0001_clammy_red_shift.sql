CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_name` text NOT NULL,
	`anonymous_session_id` text,
	`locale` text,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_events_name_time_idx` ON `analytics_events` (`event_name`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_aggregate_idx` ON `audit_events` (`aggregate_type`,`aggregate_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `auth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_signed_in_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identities_provider_subject_unique` ON `auth_identities` (`provider`,`provider_subject`);--> statement-breakpoint
CREATE TABLE `inbound_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`sender_hash` text NOT NULL,
	`command` text,
	`matched_request_id` text,
	`outcome` text NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`matched_request_id`) REFERENCES `loan_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_messages_provider_id_unique` ON `inbound_messages` (`provider`,`provider_message_id`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`channel` text NOT NULL,
	`provider_message_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`recipient_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_event_channel_unique` ON `notification_deliveries` (`event_id`,`channel`);--> statement-breakpoint
CREATE TABLE `return_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_id` text NOT NULL,
	`scheduled_for` integer NOT NULL,
	`sent_at` integer,
	`response` text,
	`responded_at` integer,
	`next_scheduled_for` integer,
	FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `return_checkins_loan_schedule_unique` ON `return_checkins` (`loan_id`,`scheduled_for`);--> statement-breakpoint
CREATE TABLE `uploaded_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`catalog_item_id` text,
	`storage_path` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`kind` text DEFAULT 'cover' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploaded_assets_storage_path_unique` ON `uploaded_assets` (`storage_path`);