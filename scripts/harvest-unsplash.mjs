/**
 * Harvest real, hotlink-friendly Unsplash CDN image URLs for each marketplace
 * category and write them to server/data/product-images.json.
 *
 * Uses Unsplash's public search endpoint (no API key required) and rewrites each
 * photo to a stable `images.unsplash.com/photo-...?auto=format&fit=crop&w=...&q=80`
 * URL so the seeded products point at real, direct images.
 *
 * Usage: node scripts/harvest-unsplash.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "server/data/product-images.json";

/** category slug -> search queries used to build its image pool */
const QUERIES = {
  furniture: ["sofa", "armchair", "coffee table", "bookshelf", "dining table", "bed frame", "wardrobe", "wooden desk"],
  electronics: ["laptop", "television", "headphones", "bluetooth speaker", "projector", "drone", "smartwatch", "tablet computer"],
  cameras: ["camera", "dslr camera", "mirrorless camera", "camera lens", "camera tripod", "action camera", "film camera"],
  fashion: ["dress", "winter coat", "saree", "handbag", "sneakers", "leather jacket", "sunglasses", "wristwatch"],
  tools: ["power drill", "toolbox", "hammer", "wrench set", "circular saw", "stepladder", "screwdriver set"],
  vehicles: ["bicycle", "motorcycle", "scooter", "skateboard", "kayak", "electric bike", "car"],
  music: ["acoustic guitar", "piano", "violin", "drum kit", "synthesizer keyboard", "microphone", "saxophone"],
  gaming: ["game console", "gaming controller", "gaming computer", "video game", "arcade machine"],
  sports: ["football", "cricket bat", "tennis racket", "dumbbell", "yoga mat", "boxing gloves", "surfboard"],
  outdoor: ["camping tent", "hiking backpack", "hiking boots", "sleeping bag", "campfire", "fishing rod"],
  home: ["table lamp", "area rug", "flower vase", "wall mirror", "wall clock", "plant pot", "curtains", "scented candle"],
  appliances: ["microwave oven", "refrigerator", "washing machine", "air fryer", "blender", "coffee machine", "vacuum cleaner", "electric kettle"],
};

const PER_PAGE = 30;
const PAGES = 2;
const CONCURRENCY = 3;

function toDirectUrl(photo) {
  const base = (photo.urls?.raw ?? photo.urls?.full ?? "").split("?")[0];
  if (!base || !base.includes("images.unsplash.com")) return null;
  return `${base}?auto=format&fit=crop&w=900&q=80`;
}

function altFor(photo) {
  const text = photo.alt_description || photo.description || "";
  return (text || "").replace(/\s+/g, " ").trim().slice(0, 190);
}

async function search(query, page) {
  const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json.results) ? json.results : [];
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  ! ${query} p${page}: ${err.message}`);
        return [];
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  return [];
}

async function runPool(tasks, limit) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

async function main() {
  const out = {};
  for (const [slug, queries] of Object.entries(QUERIES)) {
    const tasks = [];
    for (const q of queries) for (let p = 1; p <= PAGES; p += 1) tasks.push(() => search(q, p));
    const pages = await runPool(tasks, CONCURRENCY);

    const seen = new Set();
    const pool = [];
    for (const page of pages) {
      for (const photo of page) {
        const url = toDirectUrl(photo);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        pool.push({ url, alt: altFor(photo) });
      }
    }
    out[slug] = pool;
    console.log(`${slug.padEnd(12)} ${String(pool.length).padStart(4)} images`);
  }

  const total = Object.values(out).reduce((n, p) => n + p.length, 0);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nWrote ${total} images across ${Object.keys(out).length} categories -> ${OUT}`);
}

main().catch((err) => {
  console.error("Harvest failed:", err);
  process.exitCode = 1;
});
