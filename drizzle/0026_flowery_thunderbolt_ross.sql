ALTER TABLE `admin_audit_log` ADD `actor_role` varchar(32);--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD `reason` varchar(300);--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD `ip` varchar(45);--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD `user_agent` varchar(400);--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD `request_id` varchar(64);--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD `before_state` text;--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD `after_state` text;--> statement-breakpoint
CREATE INDEX `admin_audit_log_actor_role_idx` ON `admin_audit_log` (`actor_role`,`created_at`);