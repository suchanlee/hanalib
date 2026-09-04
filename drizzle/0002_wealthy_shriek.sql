ALTER TABLE `book_editions` ADD `title_en` text;--> statement-breakpoint
ALTER TABLE `book_editions` ADD `authors_en_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `book_editions` ADD `cover_tone` text DEFAULT 'blue' NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_items` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_items_idempotency_unique` ON `catalog_items` (`idempotency_key`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `notification_channel` text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `loan_requests_one_pending_member_item_unique` ON `loan_requests` (`catalog_item_id`,`requester_id`) WHERE "loan_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `loans_one_active_item_unique` ON `loans` (`catalog_item_id`) WHERE "loans"."status" = 'active';