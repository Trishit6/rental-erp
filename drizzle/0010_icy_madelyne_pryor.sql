CREATE TABLE `review_helpful_votes` (
	`review_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `review_helpful_votes_review_id_user_id_pk` PRIMARY KEY(`review_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `reviews` ADD `order_item_id` int;--> statement-breakpoint
ALTER TABLE `reviews` ADD `purchase_type` varchar(8) DEFAULT 'PURCHASE' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `is_verified_purchase` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `status` varchar(10) DEFAULT 'PUBLISHED' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `is_edited` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `helpful_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `images` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `seller_reply` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `seller_replied_at` timestamp;--> statement-breakpoint
ALTER TABLE `reviews` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_order_item_unique` UNIQUE(`order_item_id`);--> statement-breakpoint
-- Data backfill: every review written before this migration is by definition backed by an
-- order or a rental, because that was the only way the old endpoint would accept one. Marking
-- them verified is therefore a statement about history, not a new claim - and leaving the flag
-- false would retroactively unverify real reviews and change published averages.
UPDATE `reviews` SET `is_verified_purchase` = 1 WHERE `order_id` IS NOT NULL OR `rental_id` IS NOT NULL;--> statement-breakpoint
-- A rental review is one pointing at a rental row; everything else is a purchase. Deriving it
-- from `rental_id` (not from the order's type) keeps a MIXED order's line-level answer correct.
UPDATE `reviews` SET `purchase_type` = 'RENTAL' WHERE `rental_id` IS NOT NULL;--> statement-breakpoint
UPDATE `reviews` SET `purchase_type` = 'PURCHASE' WHERE `rental_id` IS NULL;--> statement-breakpoint
-- `updated_at` defaulted to the migration's own run time, which would date every legacy review
-- to today. An edited-at stamp must be >= created-at and must not invent history.
UPDATE `reviews` SET `updated_at` = `created_at` WHERE `updated_at` > `created_at`;--> statement-breakpoint
ALTER TABLE `review_helpful_votes` ADD CONSTRAINT `review_helpful_votes_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_helpful_votes` ADD CONSTRAINT `review_helpful_votes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `review_helpful_votes_user_id_idx` ON `review_helpful_votes` (`user_id`);--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `reviews_user_id_idx` ON `reviews` (`user_id`);--> statement-breakpoint
CREATE INDEX `reviews_product_status_created_idx` ON `reviews` (`product_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_order_item_id_idx` ON `reviews` (`order_item_id`);