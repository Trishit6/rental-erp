ALTER TABLE `sessions` ADD `refresh_token_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `sessions` ADD `previous_refresh_token_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `sessions` ADD `rotated_at` timestamp;--> statement-breakpoint
ALTER TABLE `sessions` ADD `revoked_at` timestamp;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_refresh_token_hash_idx` UNIQUE(`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_previous_refresh_token_hash_idx` ON `sessions` (`previous_refresh_token_hash`);
