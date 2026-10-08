CREATE TABLE `idempotency_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` varchar(40) NOT NULL,
	`key` varchar(120) NOT NULL,
	`user_id` int,
	`request_hash` varchar(64) NOT NULL,
	`status_code` int,
	`response_body` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	CONSTRAINT `idempotency_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `idempotency_keys_scope_key_unique` UNIQUE(`scope`,`key`),
	CONSTRAINT `idempotency_keys_scope_not_empty` CHECK(LENGTH(`idempotency_keys`.`scope`) > 0),
	CONSTRAINT `idempotency_keys_key_not_empty` CHECK(LENGTH(`idempotency_keys`.`key`) > 0)
);
--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`type` varchar(32) NOT NULL,
	`from_status` varchar(20),
	`to_status` varchar(20) NOT NULL,
	`actor_id` int,
	`actor_role` varchar(10),
	`note` varchar(300),
	`metadata` text,
	`event_key` varchar(190),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_events_event_key_unique` UNIQUE(`event_key`),
	CONSTRAINT `order_events_type_not_empty` CHECK(LENGTH(`order_events`.`type`) > 0)
);
--> statement-breakpoint
CREATE TABLE `payment_webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(20) NOT NULL,
	`event_id` varchar(160) NOT NULL,
	`event_type` varchar(60) NOT NULL,
	`payload` text NOT NULL,
	`signature_verified` boolean NOT NULL DEFAULT false,
	`status` varchar(16) NOT NULL DEFAULT 'RECEIVED',
	`error_message` varchar(300),
	`processed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_webhook_events_provider_event_unique` UNIQUE(`provider`,`event_id`),
	CONSTRAINT `payment_webhook_events_event_not_empty` CHECK(LENGTH(`payment_webhook_events`.`event_id`) > 0)
);
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`key` varchar(80) NOT NULL,
	`value` json NOT NULL,
	`description` varchar(200),
	`updated_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `search_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`term` varchar(120) NOT NULL,
	`result_count` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `search_history_id` PRIMARY KEY(`id`),
	CONSTRAINT `search_history_user_term_unique` UNIQUE(`user_id`,`term`),
	CONSTRAINT `search_history_term_not_empty` CHECK(LENGTH(TRIM(`search_history`.`term`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `stock_reservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`user_id` int NOT NULL,
	`order_id` int,
	`quantity` int NOT NULL DEFAULT 1,
	`rental_start` timestamp,
	`rental_end` timestamp,
	`expires_at` timestamp NOT NULL,
	`status` varchar(12) NOT NULL DEFAULT 'ACTIVE',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_reservations_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_reservations_quantity_positive` CHECK(`stock_reservations`.`quantity` > 0),
	CONSTRAINT `stock_reservations_window_ordered` CHECK(`stock_reservations`.`rental_end` IS NULL OR `stock_reservations`.`rental_start` IS NULL OR `stock_reservations`.`rental_end` > `stock_reservations`.`rental_start`)
);
--> statement-breakpoint
DROP INDEX `transactions_provider_transaction_id_idx` ON `transactions`;--> statement-breakpoint
ALTER TABLE `addresses` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `cart_items` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `carts` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `categories` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `notification_preferences` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `payouts` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `rentals` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `reviews` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `seller_payout_methods` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `seller_profiles` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `transactions` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `wallet_transactions` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `conversation_participants` ADD `created_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `order_items` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `product_images` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `product_tags` ADD `created_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_provider_reference_unique` UNIQUE(`provider_transaction_id`);--> statement-breakpoint
ALTER TABLE `idempotency_keys` ADD CONSTRAINT `idempotency_keys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_settings` ADD CONSTRAINT `platform_settings_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `search_history` ADD CONSTRAINT `search_history_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idempotency_keys_expires_at_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idempotency_keys_user_id_idx` ON `idempotency_keys` (`user_id`);--> statement-breakpoint
CREATE INDEX `order_events_order_created_idx` ON `order_events` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_webhook_events_status_created_idx` ON `payment_webhook_events` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `search_history_user_created_idx` ON `search_history` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_reservations_product_expires_idx` ON `stock_reservations` (`product_id`,`expires_at`,`status`);--> statement-breakpoint
CREATE INDEX `stock_reservations_status_expires_idx` ON `stock_reservations` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `stock_reservations_user_id_idx` ON `stock_reservations` (`user_id`);--> statement-breakpoint
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_quantity_positive` CHECK (`cart_items`.`quantity` > 0);--> statement-breakpoint
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_unit_price_nonneg` CHECK (`cart_items`.`unit_price_snapshot` >= 0);--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_unit_price_nonneg` CHECK (`order_items`.`unit_price` >= 0);--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_rental_charge_nonneg` CHECK (`order_items`.`rental_charge` >= 0);--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_deposit_nonneg` CHECK (`order_items`.`security_deposit` >= 0);--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_line_total_nonneg` CHECK (`order_items`.`line_total` >= 0);--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_quantity_positive` CHECK (`order_items`.`quantity` > 0);--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_rent_credit_nonneg` CHECK (`order_items`.`rent_credit_applied` >= 0);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_subtotal_nonneg` CHECK (`orders`.`subtotal` >= 0);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_delivery_fee_nonneg` CHECK (`orders`.`delivery_fee` >= 0);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_deposit_total_nonneg` CHECK (`orders`.`deposit_total` >= 0);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_discount_nonneg` CHECK (`orders`.`discount` >= 0);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_tax_nonneg` CHECK (`orders`.`tax` >= 0);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_total_nonneg` CHECK (`orders`.`total` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_purchase_price_nonneg` CHECK (`products`.`purchase_price` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_rental_price_day_nonneg` CHECK (`products`.`rental_price_per_day` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_rental_price_week_nonneg` CHECK (`products`.`rental_price_per_week` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_rental_price_month_nonneg` CHECK (`products`.`rental_price_per_month` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_deposit_nonneg` CHECK (`products`.`security_deposit` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_rent_to_own_price_nonneg` CHECK (`products`.`rent_to_own_price` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_rent_credit_pct_range` CHECK (`products`.`rent_credit_percentage` BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_quantity_positive` CHECK (`products`.`quantity` > 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_available_quantity_nonneg` CHECK (`products`.`available_quantity` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_aggregates_nonneg` CHECK (`products`.`rating_average` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_aggregate_counts_nonneg` CHECK (`products`.`rating_count` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_favorite_count_nonneg` CHECK (`products`.`favorite_count` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_view_count_nonneg` CHECK (`products`.`view_count` >= 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_min_rental_days_positive` CHECK (`products`.`minimum_rental_days` IS NULL OR `products`.`minimum_rental_days` > 0);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_rental_window_ordered` CHECK (`products`.`maximum_rental_days` IS NULL OR `products`.`minimum_rental_days` IS NULL OR `products`.`maximum_rental_days` >= `products`.`minimum_rental_days`);--> statement-breakpoint
ALTER TABLE `rentals` ADD CONSTRAINT `rentals_daily_rate_nonneg` CHECK (`rentals`.`daily_rate` >= 0);--> statement-breakpoint
ALTER TABLE `rentals` ADD CONSTRAINT `rentals_subtotal_nonneg` CHECK (`rentals`.`rental_subtotal` >= 0);--> statement-breakpoint
ALTER TABLE `rentals` ADD CONSTRAINT `rentals_deposit_nonneg` CHECK (`rentals`.`security_deposit` >= 0);--> statement-breakpoint
ALTER TABLE `rentals` ADD CONSTRAINT `rentals_delivery_fee_nonneg` CHECK (`rentals`.`delivery_fee` >= 0);--> statement-breakpoint
ALTER TABLE `rentals` ADD CONSTRAINT `rentals_total_nonneg` CHECK (`rentals`.`total` >= 0);--> statement-breakpoint
ALTER TABLE `rentals` ADD CONSTRAINT `rentals_rent_credit_nonneg` CHECK (`rentals`.`rent_credit_applied` >= 0);--> statement-breakpoint
ALTER TABLE `rentals` ADD CONSTRAINT `rentals_extension_days_positive` CHECK (`rentals`.`extension_requested_days` IS NULL OR `rentals`.`extension_requested_days` > 0);--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_rating_in_range` CHECK (`reviews`.`rating` BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_helpful_count_nonneg` CHECK (`reviews`.`helpful_count` >= 0);--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_amount_nonneg` CHECK (`transactions`.`amount` >= 0);--> statement-breakpoint
CREATE INDEX `order_items_seller_order_idx` ON `order_items` (`seller_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `orders_user_created_idx` ON `orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `products_status_category_created_idx` ON `products` (`status`,`category_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `products_seller_status_idx` ON `products` (`seller_id`,`status`);--> statement-breakpoint
CREATE INDEX `rentals_product_start_end_idx` ON `rentals` (`product_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `rentals_status_end_idx` ON `rentals` (`status`,`end_date`);--> statement-breakpoint
CREATE INDEX `rentals_renter_status_idx` ON `rentals` (`renter_id`,`status`);--> statement-breakpoint
CREATE INDEX `rentals_owner_status_idx` ON `rentals` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `reports_status_created_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_status_created_idx` ON `transactions` (`status`,`created_at`);