CREATE TABLE `rate_limit_counters` (
	`bucket_key` varchar(190) NOT NULL,
	`count` int NOT NULL DEFAULT 1,
	`window_started_at` bigint NOT NULL,
	`expires_at` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rate_limit_counters_bucket_key` PRIMARY KEY(`bucket_key`)
);
--> statement-breakpoint
CREATE INDEX `rate_limit_counters_expires_idx` ON `rate_limit_counters` (`expires_at`);