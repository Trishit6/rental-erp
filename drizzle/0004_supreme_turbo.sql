ALTER TABLE `transactions` MODIFY COLUMN `status` varchar(12) NOT NULL DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE `order_items` ADD `rental_charge` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `security_deposit` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `order_number` varchar(20);--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_status` varchar(20) DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `tax` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `currency` varchar(3) DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `provider_idempotency_key` varchar(100);--> statement-breakpoint
ALTER TABLE `transactions` ADD `idempotency_key` varchar(100);--> statement-breakpoint
ALTER TABLE `transactions` ADD `payment_method` varchar(16);--> statement-breakpoint
ALTER TABLE `transactions` ADD `processed_event_ids` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `metadata` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `failure_reason` varchar(255);--> statement-breakpoint
ALTER TABLE `transactions` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_order_number_unique` UNIQUE(`order_number`);--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_idempotency_key_unique` UNIQUE(`idempotency_key`);--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_provider_idempotency_key_unique` UNIQUE(`provider_idempotency_key`);--> statement-breakpoint
CREATE INDEX `transactions_status_idx` ON `transactions` (`status`);--> statement-breakpoint
CREATE INDEX `transactions_provider_transaction_id_idx` ON `transactions` (`provider_transaction_id`);