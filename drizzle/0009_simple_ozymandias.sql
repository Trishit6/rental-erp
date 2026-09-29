ALTER TABLE `order_items` ADD `fulfillment_status` varchar(20);--> statement-breakpoint
ALTER TABLE `order_items` ADD `cancellation_reason` varchar(300);