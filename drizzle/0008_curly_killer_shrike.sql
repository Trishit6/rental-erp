ALTER TABLE `products` ADD `specifications` text;--> statement-breakpoint
ALTER TABLE `seller_profiles` ADD `location` varchar(120);--> statement-breakpoint
ALTER TABLE `seller_profiles` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL;