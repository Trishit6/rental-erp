CREATE TABLE `admin_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`admin_id` int NOT NULL,
	`action` varchar(40) NOT NULL,
	`entity_type` varchar(20) NOT NULL,
	`entity_id` int,
	`details` varchar(300),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD CONSTRAINT `admin_audit_log_admin_id_users_id_fk` FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `admin_audit_log_admin_created_idx` ON `admin_audit_log` (`admin_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_log_entity_idx` ON `admin_audit_log` (`entity_type`,`entity_id`);