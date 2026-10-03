CREATE TABLE `payouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seller_id` int NOT NULL,
	`payout_number` varchar(20) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'INR',
	`status` varchar(12) NOT NULL DEFAULT 'PENDING',
	`method_id` int,
	`method_label` varchar(120) NOT NULL,
	`note` varchar(200),
	`failure_reason` varchar(255),
	`idempotency_key` varchar(100),
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`requested_at` timestamp NOT NULL DEFAULT (now()),
	`processing_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `payouts_payout_number_unique` UNIQUE(`payout_number`),
	CONSTRAINT `payouts_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `seller_payout_methods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seller_id` int NOT NULL,
	`type` varchar(10) NOT NULL DEFAULT 'BANK',
	`account_holder` varchar(80) NOT NULL,
	`masked_label` varchar(80) NOT NULL,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seller_payout_methods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seller_id` int NOT NULL,
	`order_id` int,
	`order_item_id` int,
	`rental_id` int,
	`payout_id` int,
	`type` varchar(20) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'INR',
	`status` varchar(12) NOT NULL DEFAULT 'PENDING',
	`description` varchar(200) NOT NULL,
	`reference` varchar(60),
	`idempotency_key` varchar(120),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallet_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallet_transactions_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_seller_id_users_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_method_id_seller_payout_methods_id_fk` FOREIGN KEY (`method_id`) REFERENCES `seller_payout_methods`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_payout_methods` ADD CONSTRAINT `seller_payout_methods_seller_id_users_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_seller_id_users_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_rental_id_rentals_id_fk` FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_payout_id_payouts_id_fk` FOREIGN KEY (`payout_id`) REFERENCES `payouts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payouts_seller_id_idx` ON `payouts` (`seller_id`);--> statement-breakpoint
CREATE INDEX `payouts_status_idx` ON `payouts` (`status`);--> statement-breakpoint
CREATE INDEX `payouts_seller_status_idx` ON `payouts` (`seller_id`,`status`);--> statement-breakpoint
CREATE INDEX `payouts_requested_at_idx` ON `payouts` (`requested_at`);--> statement-breakpoint
CREATE INDEX `seller_payout_methods_seller_id_idx` ON `seller_payout_methods` (`seller_id`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_seller_id_idx` ON `wallet_transactions` (`seller_id`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_type_idx` ON `wallet_transactions` (`type`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_status_idx` ON `wallet_transactions` (`status`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_created_at_idx` ON `wallet_transactions` (`created_at`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_seller_type_created_idx` ON `wallet_transactions` (`seller_id`,`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_order_id_idx` ON `wallet_transactions` (`order_id`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_rental_id_idx` ON `wallet_transactions` (`rental_id`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_payout_id_idx` ON `wallet_transactions` (`payout_id`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_order_item_id_idx` ON `wallet_transactions` (`order_item_id`);