CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`used_at` timestamp,
	`expires_at` timestamp NOT NULL,
	`requested_ip` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_hash_unique` UNIQUE(`token_hash`),
	CONSTRAINT `password_reset_tokens_hash_not_empty` CHECK(LENGTH(`password_reset_tokens`.`token_hash`) > 0)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `status` varchar(16) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_created_idx` ON `password_reset_tokens` (`user_id`,`created_at`);--> statement-breakpoint
-- Normalize the pre-existing representation. Suspension used to be stored by
-- overwriting `users.role` with 'SUSPENDED'; account state now lives in
-- `users.status`, and `users.role` only ever holds a real role. The legacy
-- route only ever suspended `role = 'USER'` accounts, so 'USER' is exact.
UPDATE `users` SET `role` = 'USER', `status` = 'SUSPENDED' WHERE `role` = 'SUSPENDED';