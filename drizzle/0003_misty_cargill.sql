ALTER TABLE `cart_items` ADD `unit_price_snapshot` int;--> statement-breakpoint
ALTER TABLE `cart_items` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `carts` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
CREATE INDEX `cart_items_product_id_idx` ON `cart_items` (`product_id`);