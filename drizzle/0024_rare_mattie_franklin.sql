ALTER TABLE `reports` ADD `review_id` int;--> statement-breakpoint
ALTER TABLE `reports` ADD `message_id` int;--> statement-breakpoint
ALTER TABLE `reports` ADD `order_id` int;--> statement-breakpoint
ALTER TABLE `reports` ADD `rental_id` int;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_rental_id_rentals_id_fk` FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE cascade ON UPDATE no action;