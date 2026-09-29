CREATE TABLE `rental_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rental_id` int NOT NULL,
	`type` varchar(24) NOT NULL,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rental_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_events_rental_type_unique` UNIQUE(`rental_id`,`type`)
);
--> statement-breakpoint
ALTER TABLE `rental_events` ADD CONSTRAINT `rental_events_rental_id_rentals_id_fk` FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `rental_events_rental_id_idx` ON `rental_events` (`rental_id`);