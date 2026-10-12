ALTER TABLE `support_tickets` ADD `rental_id` int;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `resolved_at` timestamp;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `closed_at` timestamp;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `resolution_rating` int;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `resolution_comment` varchar(1000);--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_rating_range` CHECK (`support_tickets`.`resolution_rating` IS NULL OR (`support_tickets`.`resolution_rating` >= 1 AND `support_tickets`.`resolution_rating` <= 5));--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_rental_id_rentals_id_fk` FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE set null ON UPDATE no action;