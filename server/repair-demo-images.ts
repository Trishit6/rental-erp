/**
 * Repair demo listings whose photos point at a dead third-party bucket.
 *
 * `seed.ts` was fixed to source product photos from the Unsplash pool in
 * `data/product-images.json`, but databases seeded *before* that fix still hold
 * the old rows: `storage.googleapis.com/banani-generated-images/generated-images/
 * <uuid>.jpg`. Fourteen of the twenty-two demo products used fabricated UUIDs
 * (`22222222-2222-2222-…`) that the bucket answers `403`, so those cards render
 * as broken images. The UI degrades gracefully — `ProductImage` shows the branded
 * placeholder — but the data underneath is still wrong, and this fixes it at the
 * source rather than hiding it.
 *
 *   pnpm db:repair-demo-images           # dry run: report, change nothing
 *   pnpm db:repair-demo-images -- --apply  # write
 *
 * Scoped deliberately: it only touches rows on the dead bucket. Product photos
 * uploaded by real sellers come from Supabase and must never be rewritten here.
 * The replacement URL is recomputed with the same picker the seed uses
 * (`lib/demo-images`), so it is identical to what a fresh `pnpm db:seed` writes
 * for the same product — a repair that disagreed with the seed would reintroduce
 * the bug one re-seed later.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { IMG } from "./lib/demo-images";
import { allowedImageHosts } from "./lib/storage";
import { productImages } from "./schema";

/**
 * The bucket the old seed pointed at. Matched on host *and* path so a real
 * Supabase upload — which shares no part of this string — can never be caught.
 */
const DEAD_IMAGE_MATCH = "storage.googleapis.com/banani-generated-images/";

const apply = process.argv.includes("--apply");

/** A URL Revaro is actually allowed to render. */
function isPermitted(url: string, hosts: string[]): boolean {
  try {
    return hosts.includes(new URL(url).host);
  } catch {
    return false;
  }
}

const hosts = allowedImageHosts();
const [rows] = await pool.query(
  `SELECT pi.id AS imageId, pi.url AS oldUrl, pi.sort_order AS sortOrder,
          p.id AS productId, p.title AS title, c.slug AS categorySlug
     FROM product_images pi
     JOIN products p   ON p.id = pi.product_id
     JOIN categories c ON c.id = p.category_id
    WHERE pi.url LIKE '%${DEAD_IMAGE_MATCH}%'
    ORDER BY p.id, pi.sort_order`,
);

const broken = rows as {
  imageId: number;
  oldUrl: string;
  sortOrder: number;
  productId: number;
  title: string;
  categorySlug: string;
}[];

console.log(`${broken.length} demo image row(s) still point at the dead bucket.`);

if (broken.length === 0) {
  console.log("Nothing to repair.");
  await pool.end();
  process.exit(0);
}

// Group by product: every photo on a product comes from the same picker call, so
// one recomputation covers all of that product's rows.
const byProduct = new Map<number, typeof broken>();
for (const row of broken) {
  const group = byProduct.get(row.productId) ?? [];
  group.push(row);
  byProduct.set(row.productId, group);
}

let repaired = 0;
let skipped = 0;

for (const group of byProduct.values()) {
  const first = group[0]!;
  // The pool key is the product's own category slug — the seed calls
  // `IMG(<category slug>, <product title>)` for exactly these listings.
  const nextUrl = IMG(first.categorySlug, first.title);

  if (!nextUrl || !isPermitted(nextUrl, hosts)) {
    console.warn(
      `  ! product ${first.productId} "${first.title}" (${first.categorySlug}): no permitted ` +
        `replacement found — leaving ${group.length} row(s) untouched. Run ` +
        `\`pnpm db:harvest-images\` if the pool is empty.`,
    );
    skipped += group.length;
    continue;
  }

  for (const row of group) {
    console.log(`  product ${row.productId} "${row.title}"`);
    console.log(`    - ${row.oldUrl}`);
    console.log(`    + ${nextUrl}`);
    if (apply) {
      await db.update(productImages).set({ url: nextUrl }).where(eq(productImages.id, row.imageId));
    }
    repaired += 1;
  }
}

console.log(
  `\n${apply ? "repaired" : "would repair"} ${repaired} row(s)` +
    (skipped ? `; skipped ${skipped}` : "") +
    `.`,
);
if (!apply) console.log("Re-run with --apply to write these changes.");

await pool.end();
