ALTER TABLE `reports` ADD `action` varchar(24);--> statement-breakpoint
ALTER TABLE `reports` ADD `action_note` varchar(500);--> statement-breakpoint
ALTER TABLE `reports` ADD `resolved_by_id` int;--> statement-breakpoint
ALTER TABLE `reports` ADD `resolved_at` timestamp;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_resolved_by_id_users_id_fk` FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;