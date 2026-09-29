-- Feature 13: the product listing lifecycle.
--
-- `ACTIVE` becomes `PUBLISHED` and gains `DRAFT` / `OUT_OF_STOCK` siblings. The
-- rename is a data migration, not only a default change: every existing row that
-- says `ACTIVE` has to be rewritten, or the whole catalogue silently disappears
-- from Browse the moment the public queries start asking for `PUBLISHED`.
--
-- The conversion is exhaustive and idempotent (it only matches `ACTIVE`), so
-- re-running it after a partial failure is safe. `SOLD` — writable by the admin
-- endpoint and understood by nothing else — is folded into `ARCHIVED`, which is
-- what it was being used to express.
UPDATE `products` SET `status` = 'PUBLISHED' WHERE `status` = 'ACTIVE';--> statement-breakpoint
UPDATE `products` SET `status` = 'ARCHIVED' WHERE `status` = 'SOLD';--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `status` varchar(16) NOT NULL DEFAULT 'DRAFT';
