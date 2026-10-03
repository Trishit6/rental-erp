import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * How a demo listing gets its photo.
 *
 * The seed used to hardcode a third-party GCS bucket per product
 * (`storage.googleapis.com/banani-generated-images/…`). Fourteen of the
 * twenty-two demo products pointed at fabricated placeholder GUIDs
 * (`22222222-2222-2222-…`) that the bucket answers `403`, so the catalogue
 * rendered as a wall of broken images. They now come from
 * `data/product-images.json` — the same Unsplash pool `db:harvest-images` fills,
 * that `seed-products.ts` uses, and that `allowedImageHosts()` permits.
 *
 * It lives in its own module for one reason: a repair script has to be able to
 * recompute *exactly* the URL the seed would have written, or a "repair" quietly
 * produces images a fresh `pnpm db:seed` would disagree with. Sharing the picker
 * is what makes the two provably identical.
 */

/** Image entries per category, as harvested. */
export type ImageEntry = { url: string; alt: string };
export type ImagePools = Record<string, ImageEntry[]>;

const POOL_RELATIVE_PATH = join("server", "data", "product-images.json");

/**
 * Where to look for the harvested pool file.
 *
 * `import.meta.url` is the honest answer under `tsx`, but it is not the only
 * runtime that loads this module: Vitest serves modules through Vite, where
 * `import.meta.url` is a URL on the dev server rather than on disk, and
 * `readFileSync` on it throws. Resolving against `import.meta.url` alone is
 * therefore a silent failure — the original version caught the throw and returned
 * `{}`, so the pools looked "empty" and every product quietly fell back to having
 * no photo, which is the same broken-image bug wearing a different hat.
 *
 * Both candidates are tried, in order, and a genuine miss is reported instead of
 * being swallowed.
 */
function poolFileCandidates(): string[] {
  const fromModule = () => {
    try {
      return resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "product-images.json");
    } catch {
      return null;
    }
  };

  return [fromModule(), join(process.cwd(), POOL_RELATIVE_PATH)].filter(
    (candidate): candidate is string => candidate !== null,
  );
}

export function loadImagePools(): ImagePools {
  const tried: string[] = [];

  for (const candidate of poolFileCandidates()) {
    tried.push(candidate);
    if (!existsSync(candidate)) continue;
    try {
      return JSON.parse(readFileSync(candidate, "utf8")) as ImagePools;
    } catch (error) {
      // Malformed JSON is a different failure from "not found", and swallowing it
      // the same way is what made the previous version lie. The original error is
      // attached so the stack that actually matters is not thrown away.
      throw new Error(`Could not parse ${candidate}`, { cause: error });
    }
  }

  console.warn(
    `[demo-images] product-images.json not found — demo listings will seed without photos.\n` +
      `  Run \`pnpm db:harvest-images\` to fetch the pool.\n` +
      `  Looked in:\n${tried.map((path) => `    ${path}`).join("\n")}`,
  );
  return {};
}

export const IMAGE_POOLS = loadImagePools();

/**
 * A stable index from any string — so a given product always gets a given photo.
 *
 * Deterministic on purpose: it is what lets the picker be re-run against a live
 * database and produce the same URLs the seed already wrote, with no stored
 * per-product offset to drift out of sync.
 */
export function pick(pool: ImageEntry[], seed: string): string | null {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length]?.url ?? null;
}

/**
 * The photo for a demo listing: its own category's pool, falling back to any pool
 * so no listing is ever imageless.
 */
export function IMG(categorySlug: string, seed: string): string {
  const pool = IMAGE_POOLS[categorySlug] ?? [];
  const anyPool = Object.values(IMAGE_POOLS).flat();
  return pick(pool, seed) ?? pick(anyPool, seed) ?? "";
}

/*
  Deliberately absent: the *category* tile photo. `seed.ts` derives that one from
  the same pools but with its own parent-inheritance rule, and it only ever runs
  during a seed. Moving a subtly-different copy of it here would be worse than
  leaving it where it is — the repair only ever has to reproduce product photos.
*/
