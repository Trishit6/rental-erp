CREATE TABLE `app_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`config_key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updated_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_config_key_unique` UNIQUE(`config_key`),
	CONSTRAINT `app_config_key_not_empty` CHECK(LENGTH(TRIM(`app_config`.`config_key`)) > 0),
	CONSTRAINT `app_config_value_not_empty` CHECK(LENGTH(TRIM(`app_config`.`value`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `cms_banners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`placement` varchar(32) NOT NULL,
	`title` varchar(120) NOT NULL,
	`subtitle` varchar(200),
	`image_url` varchar(500) NOT NULL,
	`link_url` varchar(500),
	`sort_order` int NOT NULL DEFAULT 0,
	`status` varchar(16) NOT NULL DEFAULT 'DRAFT',
	`starts_at` timestamp,
	`ends_at` timestamp,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cms_banners_id` PRIMARY KEY(`id`),
	CONSTRAINT `cms_banners_window_ordered` CHECK(`cms_banners`.`ends_at` IS NULL OR `cms_banners`.`starts_at` IS NULL OR `cms_banners`.`ends_at` > `cms_banners`.`starts_at`),
	CONSTRAINT `cms_banners_title_not_empty` CHECK(LENGTH(TRIM(`cms_banners`.`title`)) > 0),
	CONSTRAINT `cms_banners_sort_nonneg` CHECK(`cms_banners`.`sort_order` >= 0)
);
--> statement-breakpoint
CREATE TABLE `cms_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`block_key` varchar(64) NOT NULL,
	`content` text NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'DRAFT',
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cms_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `cms_blocks_key_unique` UNIQUE(`block_key`),
	CONSTRAINT `cms_blocks_key_not_empty` CHECK(LENGTH(TRIM(`cms_blocks`.`block_key`)) > 0),
	CONSTRAINT `cms_blocks_content_not_empty` CHECK(LENGTH(TRIM(`cms_blocks`.`content`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `commission_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` varchar(12) NOT NULL DEFAULT 'GLOBAL',
	`category_id` int,
	`seller_id` int,
	`percent_bp` int NOT NULL DEFAULT 0,
	`fixed_fee_paise` int NOT NULL DEFAULT 0,
	`effective_from` timestamp NOT NULL DEFAULT (now()),
	`effective_to` timestamp,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commission_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `commission_rules_scope_subject_start_unique` UNIQUE(`scope`,`category_id`,`seller_id`,`effective_from`),
	CONSTRAINT `commission_rules_percent_range` CHECK(`commission_rules`.`percent_bp` BETWEEN 0 AND 10000),
	CONSTRAINT `commission_rules_fixed_fee_nonneg` CHECK(`commission_rules`.`fixed_fee_paise` >= 0),
	CONSTRAINT `commission_rules_window_ordered` CHECK(`commission_rules`.`effective_to` IS NULL OR `commission_rules`.`effective_to` > `commission_rules`.`effective_from`),
	CONSTRAINT `commission_rules_category_requires_scope` CHECK(`commission_rules`.`scope` <> 'CATEGORY' OR `commission_rules`.`category_id` IS NOT NULL),
	CONSTRAINT `commission_rules_seller_requires_scope` CHECK(`commission_rules`.`scope` <> 'SELLER' OR `commission_rules`.`seller_id` IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coupon_id` int NOT NULL,
	`user_id` int NOT NULL,
	`order_id` int NOT NULL,
	`discount_paise` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coupon_redemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupon_redemptions_coupon_order_unique` UNIQUE(`coupon_id`,`order_id`),
	CONSTRAINT `coupon_redemptions_discount_positive` CHECK(`coupon_redemptions`.`discount_paise` > 0)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`description` varchar(200),
	`discount_type` varchar(8) NOT NULL,
	`discount_value` int NOT NULL,
	`max_discount_paise` int,
	`minimum_order_paise` int NOT NULL DEFAULT 0,
	`usage_limit` int,
	`per_user_limit` int,
	`used_count` int NOT NULL DEFAULT 0,
	`starts_at` timestamp,
	`ends_at` timestamp,
	`status` varchar(16) NOT NULL DEFAULT 'ACTIVE',
	`applies_to` varchar(12) NOT NULL DEFAULT 'ALL',
	`category_id` int,
	`seller_id` int,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`),
	CONSTRAINT `coupons_value_positive` CHECK(`coupons`.`discount_value` > 0),
	CONSTRAINT `coupons_percent_bp_range` CHECK(`coupons`.`discount_type` <> 'PERCENT' OR `coupons`.`discount_value` BETWEEN 1 AND 10000),
	CONSTRAINT `coupons_max_discount_nonneg` CHECK(`coupons`.`max_discount_paise` IS NULL OR `coupons`.`max_discount_paise` >= 0),
	CONSTRAINT `coupons_minimum_order_nonneg` CHECK(`coupons`.`minimum_order_paise` >= 0),
	CONSTRAINT `coupons_usage_limit_positive` CHECK(`coupons`.`usage_limit` IS NULL OR `coupons`.`usage_limit` > 0),
	CONSTRAINT `coupons_per_user_limit_positive` CHECK(`coupons`.`per_user_limit` IS NULL OR `coupons`.`per_user_limit` > 0),
	CONSTRAINT `coupons_used_count_nonneg` CHECK(`coupons`.`used_count` >= 0),
	CONSTRAINT `coupons_window_ordered` CHECK(`coupons`.`ends_at` IS NULL OR `coupons`.`starts_at` IS NULL OR `coupons`.`ends_at` > `coupons`.`starts_at`),
	CONSTRAINT `coupons_category_requires_scope` CHECK(`coupons`.`applies_to` <> 'CATEGORY' OR `coupons`.`category_id` IS NOT NULL),
	CONSTRAINT `coupons_used_within_limit` CHECK(`coupons`.`usage_limit` IS NULL OR `coupons`.`used_count` <= `coupons`.`usage_limit`)
);
--> statement-breakpoint
CREATE TABLE `disputes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dispute_number` varchar(20) NOT NULL,
	`order_id` int NOT NULL,
	`opened_by` int NOT NULL,
	`against_user_id` int,
	`status` varchar(20) NOT NULL DEFAULT 'OPEN',
	`reason` varchar(60) NOT NULL,
	`description` text,
	`resolution` text,
	`resolved_by` int,
	`resolved_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `disputes_id` PRIMARY KEY(`id`),
	CONSTRAINT `disputes_number_unique` UNIQUE(`dispute_number`),
	CONSTRAINT `disputes_resolved_at_not_before_created` CHECK(`disputes`.`resolved_at` IS NULL OR `disputes`.`resolved_at` >= `disputes`.`created_at`),
	CONSTRAINT `disputes_reason_not_empty` CHECK(LENGTH(TRIM(`disputes`.`reason`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `export_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`job_key` varchar(40) NOT NULL,
	`type` varchar(32) NOT NULL,
	`requested_by` int NOT NULL,
	`scope` text,
	`status` varchar(16) NOT NULL DEFAULT 'PENDING',
	`file_url` varchar(500),
	`error_message` varchar(500),
	`row_count` int,
	`expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `export_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `export_jobs_key_unique` UNIQUE(`job_key`),
	CONSTRAINT `export_jobs_row_count_nonneg` CHECK(`export_jobs`.`row_count` IS NULL OR `export_jobs`.`row_count` >= 0),
	CONSTRAINT `export_jobs_expires_after_created` CHECK(`export_jobs`.`expires_at` IS NULL OR `export_jobs`.`expires_at` > `export_jobs`.`created_at`),
	CONSTRAINT `export_jobs_type_not_empty` CHECK(LENGTH(TRIM(`export_jobs`.`type`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`description` varchar(200),
	`enabled` boolean NOT NULL DEFAULT false,
	`rollout_percent` int NOT NULL DEFAULT 0,
	`audience` varchar(16) NOT NULL DEFAULT 'ALL',
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feature_flags_id` PRIMARY KEY(`id`),
	CONSTRAINT `feature_flags_key_unique` UNIQUE(`key`),
	CONSTRAINT `feature_flags_rollout_range` CHECK(`feature_flags`.`rollout_percent` BETWEEN 0 AND 100),
	CONSTRAINT `feature_flags_key_not_empty` CHECK(LENGTH(TRIM(`feature_flags`.`key`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`identifier` varchar(320) NOT NULL,
	`user_id` int,
	`ip` varchar(45),
	`user_agent` varchar(400),
	`success` boolean NOT NULL DEFAULT false,
	`failure_reason` varchar(40),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `login_attempts_identifier_not_empty` CHECK(LENGTH(TRIM(`login_attempts`.`identifier`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `mfa_recovery_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`code_hash` varchar(128) NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mfa_recovery_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `mfa_recovery_codes_hash_unique` UNIQUE(`code_hash`),
	CONSTRAINT `mfa_recovery_codes_hash_not_empty` CHECK(LENGTH(`mfa_recovery_codes`.`code_hash`) > 0)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`description` varchar(200),
	`group_key` varchar(40) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_key_unique` UNIQUE(`key`),
	CONSTRAINT `permissions_key_not_empty` CHECK(LENGTH(TRIM(`permissions`.`key`)) > 0),
	CONSTRAINT `permissions_key_has_separator` CHECK(`permissions`.`key` LIKE '%.%')
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`refund_number` varchar(20) NOT NULL,
	`order_id` int NOT NULL,
	`order_item_id` int,
	`transaction_id` int,
	`user_id` int NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'INR',
	`reason` varchar(300),
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	`provider_reference` varchar(100),
	`idempotency_key` varchar(120),
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `refunds_id` PRIMARY KEY(`id`),
	CONSTRAINT `refunds_number_unique` UNIQUE(`refund_number`),
	CONSTRAINT `refunds_idempotency_key_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `refunds_amount_positive` CHECK(`refunds`.`amount` > 0),
	CONSTRAINT `refunds_currency_length` CHECK(LENGTH(`refunds`.`currency`) = 3)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_permissions_role_id_permission_id_pk` PRIMARY KEY(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(32) NOT NULL,
	`description` varchar(200),
	`is_system` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`),
	CONSTRAINT `roles_name_not_empty` CHECK(LENGTH(TRIM(`roles`.`name`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`type` varchar(48) NOT NULL,
	`ip` varchar(45),
	`user_agent` varchar(400),
	`details` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `security_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `security_events_type_not_empty` CHECK(LENGTH(TRIM(`security_events`.`type`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `seller_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seller_id` int NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'PENDING',
	`document_type` varchar(32),
	`document_ref_hash` varchar(128),
	`submitted_at` timestamp,
	`reviewed_at` timestamp,
	`reviewed_by` int,
	`rejection_reason` varchar(300),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seller_verifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `seller_verifications_reviewed_after_submitted` CHECK(`seller_verifications`.`reviewed_at` IS NULL OR `seller_verifications`.`submitted_at` IS NULL OR `seller_verifications`.`reviewed_at` >= `seller_verifications`.`submitted_at`),
	CONSTRAINT `seller_verifications_rejected_needs_reason` CHECK(`seller_verifications`.`status` <> 'REJECTED' OR LENGTH(TRIM(COALESCE(`seller_verifications`.`rejection_reason`, ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticket_number` varchar(20) NOT NULL,
	`user_id` int NOT NULL,
	`assignee_id` int,
	`order_id` int,
	`subject` varchar(200) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'OPEN',
	`priority` varchar(12) NOT NULL DEFAULT 'NORMAL',
	`sla_due_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `support_tickets_number_unique` UNIQUE(`ticket_number`),
	CONSTRAINT `support_tickets_sla_after_created` CHECK(`support_tickets`.`sla_due_at` IS NULL OR `support_tickets`.`sla_due_at` > `support_tickets`.`created_at`),
	CONSTRAINT `support_tickets_subject_not_empty` CHECK(LENGTH(TRIM(`support_tickets`.`subject`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `ticket_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticket_message_id` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`url` varchar(500) NOT NULL,
	`mime_type` varchar(120),
	`size_bytes` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticket_attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `ticket_attachments_size_positive` CHECK(`ticket_attachments`.`size_bytes` IS NULL OR `ticket_attachments`.`size_bytes` > 0),
	CONSTRAINT `ticket_attachments_file_not_empty` CHECK(LENGTH(TRIM(`ticket_attachments`.`file_name`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `ticket_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticket_id` int NOT NULL,
	`author_id` int NOT NULL,
	`body` text NOT NULL,
	`is_internal` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticket_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `ticket_messages_body_not_empty` CHECK(LENGTH(TRIM(`ticket_messages`.`body`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `user_mfa` (
	`user_id` int NOT NULL,
	`secret_encrypted` varchar(512) NOT NULL,
	`enabled_at` timestamp,
	`last_used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_mfa_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` int NOT NULL,
	`role_id` int NOT NULL,
	`granted_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_roles_user_id_role_id_pk` PRIMARY KEY(`user_id`,`role_id`)
);
--> statement-breakpoint
ALTER TABLE `order_items` ADD `slug_snapshot` varchar(140);--> statement-breakpoint
ALTER TABLE `products` ADD `search_text` text;--> statement-breakpoint
ALTER TABLE `seller_profiles` ADD `total_sales_paise` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_profiles` ADD `total_earnings_paise` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_profiles` ADD `listings_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_profiles` ADD `rating_average` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_profiles` ADD `rating_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `revoked_by` int;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_seen_at` timestamp;--> statement-breakpoint
ALTER TABLE `sessions` ADD `device_label` varchar(120);--> statement-breakpoint
ALTER TABLE `sessions` ADD `ip` varchar(45);--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_agent` varchar(400);--> statement-breakpoint
ALTER TABLE `sessions` ADD `mfa_verified_at` timestamp;--> statement-breakpoint
ALTER TABLE `app_config` ADD CONSTRAINT `app_config_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cms_banners` ADD CONSTRAINT `cms_banners_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cms_blocks` ADD CONSTRAINT `cms_blocks_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commission_rules` ADD CONSTRAINT `commission_rules_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commission_rules` ADD CONSTRAINT `commission_rules_seller_id_users_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commission_rules` ADD CONSTRAINT `commission_rules_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_redemptions` ADD CONSTRAINT `coupon_redemptions_coupon_id_coupons_id_fk` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_redemptions` ADD CONSTRAINT `coupon_redemptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_redemptions` ADD CONSTRAINT `coupon_redemptions_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_seller_id_users_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disputes` ADD CONSTRAINT `disputes_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disputes` ADD CONSTRAINT `disputes_opened_by_users_id_fk` FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disputes` ADD CONSTRAINT `disputes_against_user_id_users_id_fk` FOREIGN KEY (`against_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disputes` ADD CONSTRAINT `disputes_resolved_by_users_id_fk` FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feature_flags` ADD CONSTRAINT `feature_flags_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `login_attempts` ADD CONSTRAINT `login_attempts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mfa_recovery_codes` ADD CONSTRAINT `mfa_recovery_codes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_transaction_id_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `security_events` ADD CONSTRAINT `security_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_verifications` ADD CONSTRAINT `seller_verifications_seller_id_users_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_verifications` ADD CONSTRAINT `seller_verifications_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_assignee_id_users_id_fk` FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_attachments` ADD CONSTRAINT `ticket_attachments_ticket_message_id_ticket_messages_id_fk` FOREIGN KEY (`ticket_message_id`) REFERENCES `ticket_messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_messages` ADD CONSTRAINT `ticket_messages_ticket_id_support_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_messages` ADD CONSTRAINT `ticket_messages_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_mfa` ADD CONSTRAINT `user_mfa_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_granted_by_users_id_fk` FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cms_banners_placement_status_sort_idx` ON `cms_banners` (`placement`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `cms_banners_status_starts_idx` ON `cms_banners` (`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `commission_rules_scope_effective_idx` ON `commission_rules` (`scope`,`effective_from`);--> statement-breakpoint
CREATE INDEX `commission_rules_category_idx` ON `commission_rules` (`category_id`);--> statement-breakpoint
CREATE INDEX `commission_rules_seller_idx` ON `commission_rules` (`seller_id`);--> statement-breakpoint
CREATE INDEX `coupon_redemptions_user_created_idx` ON `coupon_redemptions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `coupon_redemptions_coupon_created_idx` ON `coupon_redemptions` (`coupon_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `coupons_status_starts_idx` ON `coupons` (`status`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `coupons_category_idx` ON `coupons` (`category_id`);--> statement-breakpoint
CREATE INDEX `coupons_seller_idx` ON `coupons` (`seller_id`);--> statement-breakpoint
CREATE INDEX `disputes_status_created_idx` ON `disputes` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `disputes_order_id_idx` ON `disputes` (`order_id`);--> statement-breakpoint
CREATE INDEX `disputes_user_created_idx` ON `disputes` (`opened_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `export_jobs_user_created_idx` ON `export_jobs` (`requested_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `export_jobs_status_created_idx` ON `export_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `feature_flags_enabled_idx` ON `feature_flags` (`enabled`);--> statement-breakpoint
CREATE INDEX `login_attempts_identifier_created_idx` ON `login_attempts` (`identifier`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_ip_created_idx` ON `login_attempts` (`ip`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_user_created_idx` ON `login_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mfa_recovery_codes_user_used_idx` ON `mfa_recovery_codes` (`user_id`,`used_at`);--> statement-breakpoint
CREATE INDEX `permissions_group_key_idx` ON `permissions` (`group_key`);--> statement-breakpoint
CREATE INDEX `refunds_order_id_idx` ON `refunds` (`order_id`);--> statement-breakpoint
CREATE INDEX `refunds_status_created_idx` ON `refunds` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `refunds_user_created_idx` ON `refunds` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `role_permissions_permission_id_idx` ON `role_permissions` (`permission_id`);--> statement-breakpoint
CREATE INDEX `security_events_user_created_idx` ON `security_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `security_events_type_created_idx` ON `security_events` (`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `seller_verifications_seller_status_idx` ON `seller_verifications` (`seller_id`,`status`);--> statement-breakpoint
CREATE INDEX `seller_verifications_status_created_idx` ON `seller_verifications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `support_tickets_status_created_idx` ON `support_tickets` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `support_tickets_assignee_status_idx` ON `support_tickets` (`assignee_id`,`status`);--> statement-breakpoint
CREATE INDEX `support_tickets_user_created_idx` ON `support_tickets` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `support_tickets_sla_idx` ON `support_tickets` (`sla_due_at`);--> statement-breakpoint
CREATE INDEX `ticket_attachments_message_id_idx` ON `ticket_attachments` (`ticket_message_id`);--> statement-breakpoint
CREATE INDEX `ticket_messages_ticket_created_idx` ON `ticket_messages` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_roles_role_id_idx` ON `user_roles` (`role_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_revoked_by_users_id_fk` FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `products_title_idx` ON `products` (`title`);