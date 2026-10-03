/**
 * One-off audit: which seed image URLs actually fail?
 *
 * The product cards were showing broken images, and the fix in
 * `src/components/shared/product-image.tsx` only *contains* a failure. This
 * script answers the upstream question — is the seed pool itself pointing at
 * URLs the CDN no longer serves — so a broken row can be repaired at the source
 * instead of being papered over with a placeholder forever.
 *
 *   node scripts/check-seed-images.mjs [concurrency]
 *
 * Prints every non-200 URL with its category and alt text. Read-only: it never
 * writes to the pool.
 */
import { readFile } from "node:fs/promises";

const CONCURRENCY = Number(process.argv[2] ?? 16);
const POOL_URL = new URL("../server/data/product-images.json", import.meta.url);

const pool = JSON.parse(await readFile(POOL_URL, "utf8"));

/** Flatten the category-keyed pool into one row per image. */
const rows = Object.entries(pool).flatMap(([category, images]) =>
  images.map((image) => ({ category, ...image })),
);

const total = rows.length;
console.log(`checking ${total} seed image urls (concurrency ${CONCURRENCY})`);

async function check(row) {
  // HEAD is not always answered the same way as GET by every CDN edge, so treat
  // a 405 as "inconclusive" and retry with a ranged GET.
  for (const method of ["HEAD", "GET"]) {
    try {
      const response = await fetch(row.url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
        headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
      });
      if (response.status === 200 || (method === "GET" && response.status === 206)) {
        return null;
      }
      if (response.status === 405 && method === "HEAD") continue;
      return { ...row, status: response.status };
    } catch (error) {
      if (method === "HEAD") continue;
      return { ...row, status: `ERR ${error.name}` };
    }
  }
  return null;
}

const failures = [];
let done = 0;
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (rows.length > 0) {
    const row = rows.pop();
    const failure = await check(row);
    if (failure) failures.push(failure);
    done += 1;
    if (done % 250 === 0) console.log(`  ${done}/${total} checked`);
  }
});
await Promise.all(workers);

console.log(`\n${failures.length} of ${total} urls failed:`);
for (const failure of failures) {
  console.log(`  [${failure.status}] ${failure.category} — ${failure.alt ?? "(no alt)"}`);
  console.log(`      ${failure.url}`);
}