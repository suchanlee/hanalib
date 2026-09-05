CREATE TABLE `holds` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`catalog_item_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` integer NOT NULL,
	`offered_at` integer,
	`expires_at` integer,
	`reminded_at` integer,
	`borrow_request_id` text,
	`idempotency_key` text,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`borrow_request_id`) REFERENCES `loan_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `holds_item_queue_idx` ON `holds` (`catalog_item_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `holds_member_status_idx` ON `holds` (`member_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `holds_one_active_member_item_unique` ON `holds` (`catalog_item_id`,`member_id`) WHERE "holds"."status" IN ('queued', 'offered');--> statement-breakpoint
CREATE UNIQUE INDEX `holds_one_offer_item_unique` ON `holds` (`catalog_item_id`) WHERE "holds"."status" = 'offered';--> statement-breakpoint
CREATE UNIQUE INDEX `holds_idempotency_unique` ON `holds` (`idempotency_key`);