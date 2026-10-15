CREATE TABLE `attribute_definitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(60) NOT NULL,
	`label` varchar(80) NOT NULL,
	`type` varchar(16) NOT NULL,
	`unit` varchar(24),
	`options` text,
	`group_label` varchar(60),
	`is_filterable` boolean NOT NULL DEFAULT false,
	`is_searchable` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attribute_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `attribute_definitions_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`name_key` varchar(80) NOT NULL,
	`slug` varchar(90) NOT NULL,
	`logo_url` varchar(500),
	`description` varchar(320),
	`status` varchar(16) NOT NULL DEFAULT 'ACTIVE',
	`product_count` int NOT NULL DEFAULT 0,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `brands_name_key_unique` UNIQUE(`name_key`),
	CONSTRAINT `brands_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `category_attributes` (
	`category_id` int NOT NULL,
	`attribute_id` int NOT NULL,
	`is_required` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `category_attributes_category_id_attribute_id_pk` PRIMARY KEY(`category_id`,`attribute_id`)
);
--> statement-breakpoint
CREATE TABLE `category_rules` (
	`category_id` int NOT NULL,
	`min_rental_days` int,
	`max_rental_days` int,
	`deposit_pct_bp` int,
	`late_fee_pct_bp` int,
	`allowed_modes` text,
	`rent_to_own_allowed` boolean,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `category_rules_category_id` PRIMARY KEY(`category_id`)
);
--> statement-breakpoint
CREATE TABLE `category_slug_redirects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`old_slug` varchar(60) NOT NULL,
	`category_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `category_slug_redirects_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_slug_redirects_old_slug_unique` UNIQUE(`old_slug`)
);
--> statement-breakpoint
CREATE TABLE `collection_items` (
	`collection_id` int NOT NULL,
	`product_id` int NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collection_items_collection_id_product_id_pk` PRIMARY KEY(`collection_id`,`product_id`)
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`slug` varchar(90) NOT NULL,
	`description` varchar(320),
	`image_url` varchar(500),
	`type` varchar(16) NOT NULL DEFAULT 'MANUAL',
	`rule` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`starts_at` timestamp,
	`ends_at` timestamp,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `collections_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `product_attribute_values` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`attribute_id` int NOT NULL,
	`value_key` varchar(100) NOT NULL,
	`value_text` varchar(255),
	`value_number` varchar(64),
	`value_bool` tinyint,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_attribute_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_attr_unique` UNIQUE(`product_id`,`attribute_id`,`value_key`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(40) NOT NULL,
	`name_key` varchar(40) NOT NULL,
	`slug` varchar(60) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_name_key_unique` UNIQUE(`name_key`),
	CONSTRAINT `tags_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `categories` ADD `depth` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `path` varchar(255) DEFAULT '/' NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `seo_title` varchar(120);--> statement-breakpoint
ALTER TABLE `categories` ADD `seo_description` varchar(320);--> statement-breakpoint
ALTER TABLE `categories` ADD `product_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_tags` ADD `tag_id` int;--> statement-breakpoint
ALTER TABLE `products` ADD `brand_id` int;--> statement-breakpoint
ALTER TABLE `brands` ADD CONSTRAINT `brands_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category_attributes` ADD CONSTRAINT `category_attributes_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category_attributes` ADD CONSTRAINT `category_attributes_attribute_id_attribute_definitions_id_fk` FOREIGN KEY (`attribute_id`) REFERENCES `attribute_definitions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category_rules` ADD CONSTRAINT `category_rules_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category_slug_redirects` ADD CONSTRAINT `category_slug_redirects_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collection_items` ADD CONSTRAINT `collection_items_collection_id_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collection_items` ADD CONSTRAINT `collection_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_attribute_values` ADD CONSTRAINT `product_attribute_values_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_attribute_values` ADD CONSTRAINT `product_attribute_values_attribute_id_attribute_definitions_id_fk` FOREIGN KEY (`attribute_id`) REFERENCES `attribute_definitions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `product_attr_attr_idx` ON `product_attribute_values` (`attribute_id`,`value_key`);--> statement-breakpoint
CREATE INDEX `product_attr_number_idx` ON `product_attribute_values` (`attribute_id`,`value_number`);--> statement-breakpoint
CREATE INDEX `product_attr_product_idx` ON `product_attribute_values` (`product_id`);--> statement-breakpoint
ALTER TABLE `product_tags` ADD CONSTRAINT `product_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_brand_id_brands_id_fk` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE set null ON UPDATE no action;