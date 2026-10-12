CREATE TABLE `user_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blocker_id` int NOT NULL,
	`blocked_id` int NOT NULL,
	`reason` varchar(200),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_blocks_blocker_blocked_unique` UNIQUE(`blocker_id`,`blocked_id`),
	CONSTRAINT `user_blocks_not_self` CHECK(`user_blocks`.`blocker_id` <> `user_blocks`.`blocked_id`)
);
--> statement-breakpoint
ALTER TABLE `user_blocks` ADD CONSTRAINT `user_blocks_blocker_id_users_id_fk` FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_blocks` ADD CONSTRAINT `user_blocks_blocked_id_users_id_fk` FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_blocks_blocked_id_idx` ON `user_blocks` (`blocked_id`);