-- Custom migration: drizzle-kit cannot express a FULLTEXT index, and writing one
-- into a *generated* file would have it dropped by the next `db:generate`.
-- `drizzle-kit generate --custom` records the file in the journal without diffing
-- the schema, so this survives future generates and replays on an empty database.
--
-- Everything below is additive or a backfill of a column added in 0018.
-- Nothing is dropped, renamed or rewritten.

-- -----------------------------------------------------------------------------
-- Full-text search over the denormalised search column, plus the one-off backfill
-- that gives it something to be full-text about.
--
-- Prefix fallback lives in the schema as `products_title_idx` (a plain btree on
-- `title`): `LIKE 'chair%'` cannot use this index, but it can use that one, so a
-- term with no exact-word match degrades to a prefix scan instead of a table scan.
--
-- InnoDB ignores tokens shorter than `innodb_min_token_size` (3 by default), so
-- one- and two-character queries are answered by the prefix index rather than by
-- full-text — which is the correct behaviour for them anyway.
-- -----------------------------------------------------------------------------
ALTER TABLE `products` ADD FULLTEXT INDEX `products_search_fulltext` (`search_text`);--> statement-breakpoint

-- Snapshot the slug onto every existing order line.
--
-- `order_items.slug_snapshot` was added nullable in 0018 so the column could land
-- without inventing a value for rows that predate it. This fills them all from the
-- product's current slug: the best available answer for a historical row, and the
-- same one the receipt already uses for the title snapshot beside it.
UPDATE `order_items` `oi`
JOIN `products` `p` ON `p`.`id` = `oi`.`product_id`
SET `oi`.`slug_snapshot` = `p`.`slug`
WHERE `oi`.`slug_snapshot` IS NULL;--> statement-breakpoint

-- One-off backfill of `products.search_text`.
--
-- From here on it is written by whichever path changes `title` or `description`,
-- in the same transaction as the change (see the column's comment in
-- `server/schema.ts`). This only settles the rows that already exist, so search
-- works the moment the index above is created rather than only for products
-- edited afterwards.
--
-- `NULLIF` on both sides means a product with no description still gets its title,
-- and never a literal "null" in the middle of its search text.
UPDATE `products`
SET `search_text` = TRIM(CONCAT_WS(' ', `title`, IFNULL(`description`, '')))
WHERE `search_text` IS NULL OR `search_text` = '';--> statement-breakpoint

-- `seller_profiles.listings_count` — the one seller total that is unambiguous to
-- compute from existing rows: a listing either exists for that seller or it does
-- not.
--
-- The money totals (`total_sales_paise`, `total_earnings_paise`) and the rating
-- aggregates are deliberately left at their `0` defaults. Guessing them here
-- would mean inventing a definition of "sale" — which rows count, whether a
-- refund reverses one, whether a deposit is revenue — that the order pipeline
-- does not yet have, and a number that disagrees with the ledger is worse than a
-- zero that has not been filled in yet. They are written inside the transaction
-- that moves the underlying rows.
UPDATE `seller_profiles` `sp`
JOIN (
  SELECT `seller_id`, COUNT(*) AS `n`
  FROM `products`
  WHERE `seller_id` IS NOT NULL
  GROUP BY `seller_id`
) `p` ON `p`.`seller_id` = `sp`.`user_id`
SET `sp`.`listings_count` = `p`.`n`;--> statement-breakpoint

-- Every seller with no listings is left at the default `0` by the statement above
-- (an `UPDATE ... JOIN` only touches matched rows), so nothing here needs to
-- reset them.
