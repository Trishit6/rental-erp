CREATE TABLE `notification_preferences` (
	`user_id` int NOT NULL,
	`orders_in_app` boolean NOT NULL DEFAULT true,
	`orders_email` boolean NOT NULL DEFAULT true,
	`rentals_in_app` boolean NOT NULL DEFAULT true,
	`rentals_email` boolean NOT NULL DEFAULT true,
	`payments_in_app` boolean NOT NULL DEFAULT true,
	`payments_email` boolean NOT NULL DEFAULT true,
	`seller_in_app` boolean NOT NULL DEFAULT true,
	`seller_email` boolean NOT NULL DEFAULT false,
	`wishlist_in_app` boolean NOT NULL DEFAULT true,
	`admin_in_app` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_preferences_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `type` varchar(40) NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `order_id` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `rental_id` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD `related_entity_type` varchar(16);--> statement-breakpoint
ALTER TABLE `notifications` ADD `related_entity_id` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD `metadata` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `event_key` varchar(190);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_event_key_unique` UNIQUE(`event_key`);--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_rental_id_rentals_id_fk` FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `conversations_last_message_at_idx` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE INDEX `messages_conversation_created_idx` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_entity_idx` ON `notifications` (`related_entity_type`,`related_entity_id`);