ALTER TABLE `coupons` ADD `product_id` int;--> statement-breakpoint
ALTER TABLE `coupons` ADD `stackable` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `coupons` ADD `allow_deposit_discount` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coupons_product_idx` ON `coupons` (`product_id`);