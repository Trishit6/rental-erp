ALTER TABLE `users` ADD `must_change_password` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `must_enroll_mfa` boolean DEFAULT false NOT NULL;