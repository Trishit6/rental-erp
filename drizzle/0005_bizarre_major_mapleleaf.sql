ALTER TABLE `rentals` ADD `return_requested_at` timestamp;--> statement-breakpoint
ALTER TABLE `rentals` ADD `completed_at` timestamp;--> statement-breakpoint
ALTER TABLE `rentals` ADD `extension_requested_at` timestamp;--> statement-breakpoint
ALTER TABLE `rentals` ADD `extension_requested_days` int;