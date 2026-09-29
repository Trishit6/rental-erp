/**
 * Bulk product seeder for Revaro.
 *
 * Inserts N (default 20,000) realistic marketplace products across all
 * categories, each with a primary image plus 2-4 alternative images and alt
 * text, tags, prices, rental tiers and availability. Images are real direct
 * Unsplash CDN links harvested by `node scripts/harvest-unsplash.mjs`.
 *
 * Requires the base seed (users + categories) to exist:
 *   pnpm db:migrate && pnpm db:seed
 *
 * Usage:
 *   tsx server/seed-products.ts                    # append 20,000 products
 *   PRODUCT_COUNT=500 tsx server/seed-products.ts
 *   CLEAR_PRODUCTS=1 tsx server/seed-products.ts   # delete ALL products first
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { categories, productImages, products, productTags, sellerProfiles, users } from "./schema";

/* --------------------------------- config ---------------------------------- */

const COUNT = Number(process.env.PRODUCT_COUNT ?? 20000);
const CLEAR = process.env.CLEAR_PRODUCTS === "1";
const SEED = Number(process.env.SEED ?? 20260927);
const PRODUCT_BATCH = 400;
const CHILD_BATCH = 1000;

type ImageEntry = { url: string; alt: string };

function loadImagePools(): Record<string, ImageEntry[]> {
  const raw = readFileSync(new URL("./data/product-images.json", import.meta.url), "utf8");
  return JSON.parse(raw) as Record<string, ImageEntry[]>;
}

/* ------------------------------ deterministic RNG --------------------------- */

function mulberry32(a: number) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------- category data ------------------------------ */

type CategoryMeta = {
  slug: string;
  nouns: string[];
  brands: string[];
  descriptors: string[];
  buy: [number, number];
  day: [number, number];
  tags: string[];
};

const CATEGORY_META: CategoryMeta[] = [
  {
    slug: "furniture",
    nouns: [
      "sofa",
      "armchair",
      "coffee table",
      "bookshelf",
      "dining table",
      "bed frame",
      "wardrobe",
      "study desk",
      "recliner",
      "sideboard",
      "bench",
      "ottoman",
    ],
    brands: ["Urban Ladder", "Wakefit", "Godrej Interio", "Nilkamal", "Durian", "Pepperfry"],
    descriptors: [
      "Scandinavian",
      "solid sheesham",
      "mid-century",
      "compact",
      "rustic",
      "upholstered",
      "modular",
      "handcrafted",
    ],
    buy: [3000, 80000],
    day: [80, 900],
    tags: ["living room", "wooden", "home"],
  },
  {
    slug: "electronics",
    nouns: [
      "laptop",
      "smart TV",
      "headphones",
      "bluetooth speaker",
      "projector",
      "camera drone",
      "smartwatch",
      "tablet",
      "soundbar",
      "e-reader",
      "power bank",
      "monitor",
    ],
    brands: ["Samsung", "LG", "Sony", "Bose", "JBL", "boAt", "Anker", "Xiaomi"],
    descriptors: [
      "4K",
      "noise-cancelling",
      "portable",
      "wireless",
      "smart",
      "ultra-slim",
      "renewed",
    ],
    buy: [5000, 120000],
    day: [150, 1200],
    tags: ["gadget", "tech", "entertainment"],
  },
  {
    slug: "cameras",
    nouns: [
      "mirrorless camera",
      "DSLR body",
      "50mm prime lens",
      "zoom lens",
      "camera tripod",
      "action camera",
      "film camera",
      "gimbal",
      "ring light",
      "camera bag",
    ],
    brands: ["Canon", "Nikon", "Sony", "Fujifilm", "GoPro", "DJI", "Sigma", "Tamron"],
    descriptors: ["full-frame", "prime", "weather-sealed", "vlogging", "professional"],
    buy: [8000, 200000],
    day: [200, 1500],
    tags: ["photography", "lens", "gear"],
  },
  {
    slug: "fashion",
    nouns: [
      "maxi dress",
      "trench coat",
      "banarasi saree",
      "leather handbag",
      "sneakers",
      "biker jacket",
      "sunglasses",
      "statement watch",
      "lehenga",
      "blazer",
    ],
    brands: ["Zara", "H&M", "Levi's", "FabIndia", "Allen Solly", "Ray-Ban", "Puma"],
    descriptors: ["designer", "vintage", "occasion", "premium", "sustainable"],
    buy: [800, 25000],
    day: [80, 800],
    tags: ["outfit", "style", "occasion"],
  },
  {
    slug: "tools",
    nouns: [
      "cordless drill",
      "40-piece bit set",
      "claw hammer",
      "spanner set",
      "circular saw",
      "aluminium ladder",
      "screwdriver kit",
      "angle grinder",
      "sander",
      "tool chest",
    ],
    brands: ["Bosch", "Makita", "Stanley", "DeWalt", "Black+Decker"],
    descriptors: ["20V", "heavy-duty", "compact", "professional-grade"],
    buy: [1500, 40000],
    day: [90, 700],
    tags: ["diy", "workshop", "repair"],
  },
  {
    slug: "vehicles",
    nouns: [
      "mountain bike",
      "scooter",
      "e-bike",
      "electric scooter",
      "skateboard",
      "kayak",
      "longboard",
      "folding cycle",
    ],
    brands: ["Hero", "Firefox", "Btwin", "Ather", "Ola Electric", "Decathlon"],
    descriptors: ["27.5-inch", "foldable", "electric", "all-terrain", "commuter"],
    buy: [4000, 90000],
    day: [120, 1500],
    tags: ["ride", "commute", "weekend"],
  },
  {
    slug: "music",
    nouns: [
      "acoustic guitar",
      "digital piano",
      "violin",
      "drum kit",
      "synthesizer",
      "studio microphone",
      "alto saxophone",
      "ukulele",
      "DJ controller",
      "audio interface",
    ],
    brands: ["Yamaha", "Fender", "Roland", "Casio", "Korg", "Shure"],
    descriptors: ["full-size", "beginner", "studio", "vintage", "tour-ready"],
    buy: [3000, 120000],
    day: [120, 1200],
    tags: ["instrument", "audio", "performance"],
  },
  {
    slug: "gaming",
    nouns: [
      "game console",
      "wireless controller",
      "gaming laptop",
      "gaming PC",
      "retro console",
      "racing wheel",
      "VR headset",
      "arcade stick",
    ],
    brands: ["Sony", "Microsoft", "Nintendo", "ASUS", "Logitech", "Razer"],
    descriptors: ["next-gen", "RTX", "limited edition", "bundled", "refurbished"],
    buy: [5000, 150000],
    day: [200, 1500],
    tags: ["games", "console", "esports"],
  },
  {
    slug: "sports",
    nouns: [
      "football",
      "cricket bat",
      "tennis racket",
      "dumbbell set",
      "yoga mat",
      "boxing gloves",
      "badminton set",
      "surfboard",
      "treadmill",
      "exercise cycle",
    ],
    brands: ["Nivia", "SG", "Yonex", "Cosco", "Decathlon", "Adidas"],
    descriptors: ["pro", "all-weather", "beginners", "competition", "training"],
    buy: [500, 20000],
    day: [50, 500],
    tags: ["fitness", "training", "weekend"],
  },
  {
    slug: "outdoor",
    nouns: [
      "camping tent",
      "trekking backpack",
      "hiking boots",
      "sleeping bag",
      "portable stove",
      "fishing rod",
      "binoculars",
      "trekking poles",
      "hammock",
      "camp lantern",
    ],
    brands: ["Decathlon", "Quechua", "Wildcraft", "Coleman"],
    descriptors: ["4-person", "water-resistant", "ultralight", "all-season", "compact"],
    buy: [1000, 30000],
    day: [60, 600],
    tags: ["camping", "trek", "adventure"],
  },
  {
    slug: "home",
    nouns: [
      "table lamp",
      "area rug",
      "ceramic vase",
      "wall mirror",
      "wall clock",
      "planter",
      "blackout curtains",
      "scented candle",
      "photo frame",
      "cushion set",
    ],
    brands: ["FabIndia", "Home Centre", "Chumbak", "IKEA", "Nestasia"],
    descriptors: ["handwoven", "boho", "minimal", "artisan", "decorative"],
    buy: [500, 25000],
    day: [50, 500],
    tags: ["decor", "interior", "cosy"],
  },
  {
    slug: "appliances",
    nouns: [
      "microwave oven",
      "mini refrigerator",
      "washing machine",
      "air fryer",
      "blender",
      "coffee machine",
      "vacuum cleaner",
      "electric kettle",
      "induction cooktop",
      "dishwasher",
    ],
    brands: ["Philips", "LG", "Samsung", "Dyson", "Instant", "Prestige", "Bosch"],
    descriptors: ["5-star", "inverter", "compact", "energy-efficient", "smart"],
    buy: [1500, 60000],
    day: [90, 700],
    tags: ["kitchen", "cleaning", "utility"],
  },
];

const LOCATIONS = [
  "Indiranagar, Bengaluru",
  "Koramangala, Bengaluru",
  "HSR Layout, Bengaluru",
  "Whitefield, Bengaluru",
  "Jayanagar, Bengaluru",
  "Bandra West, Mumbai",
  "Powai, Mumbai",
  "Andheri East, Mumbai",
  "Vashi, Navi Mumbai",
  "Hauz Khas, New Delhi",
  "Saket, New Delhi",
  "Gurugram, Haryana",
  "Noida, Uttar Pradesh",
  "Baner, Pune",
  "Kothrud, Pune",
  "Viman Nagar, Pune",
  "Adyar, Chennai",
  "Anna Nagar, Chennai",
  "Jubilee Hills, Hyderabad",
  "Gachibowli, Hyderabad",
  "Salt Lake, Kolkata",
  "New Town, Kolkata",
  "Kochi, Kerala",
  "Ahmedabad, Gujarat",
];

const CONDITIONS = ["NEW", "LIKE_NEW", "GOOD", "GOOD", "GOOD", "FAIR", "USED"] as const;
type Condition = (typeof CONDITIONS)[number];

const LISTING_TYPES = ["SALE", "RENT", "BOTH", "BOTH", "SALE", "RENT"] as const;
type ListingType = (typeof LISTING_TYPES)[number];

/* --------------------------------- helpers --------------------------------- */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);

const paise = (rupees: number) => Math.round(rupees * 100);

const pick = <T>(rnd: () => number, arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

const randInt = (rnd: () => number, min: number, max: number) =>
  Math.floor(rnd() * (max - min + 1)) + min;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function pickImages(rnd: () => number, pool: ImageEntry[], n: number): ImageEntry[] {
  const chosen: ImageEntry[] = [];
  const used = new Set<number>();
  let guard = 0;
  while (chosen.length < n && guard < n * 12) {
    guard += 1;
    const i = Math.floor(rnd() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    chosen.push(pool[i]);
  }
  return chosen;
}

/* ----------------------------------- main ---------------------------------- */

async function main() {
  if (!Number.isFinite(COUNT) || COUNT <= 0) {
    throw new Error(`Invalid PRODUCT_COUNT: ${process.env.PRODUCT_COUNT}`);
  }
  const rnd = mulberry32(SEED);
  const pools = loadImagePools();

  const sellerRows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, users.id));
  const sellerIds = sellerRows.map((r) => r.id);
  if (sellerIds.length === 0) {
    throw new Error("No sellers found. Run `pnpm db:seed` first to create users + categories.");
  }

  const categoryRows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories);
  const categoryIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));
  const usable = CATEGORY_META.filter(
    (m) => categoryIdBySlug.has(m.slug) && (pools[m.slug]?.length ?? 0) > 0,
  );
  if (usable.length === 0) {
    throw new Error(
      "No category image pools available. Run `node scripts/harvest-unsplash.mjs` first.",
    );
  }

  if (CLEAR) {
    console.log("CLEAR_PRODUCTS=1 -> deleting all existing products...");
    await db.delete(productTags);
    await db.delete(productImages);
    await db.delete(products);
  }

  const existing = await db.select({ id: products.id }).from(products);
  const offset = existing.length;
  console.log(
    `Seeding ${COUNT} products (sellers: ${sellerIds.length}, categories: ${usable.length}, existing: ${offset})...`,
  );

  const now = Date.now();

  type ProductInsert = typeof products.$inferInsert;
  type ImageInsert = typeof productImages.$inferInsert;
  type TagInsert = typeof productTags.$inferInsert;

  let inserted = 0;
  let imageRows = 0;
  let tagRows = 0;

  for (let start = 0; start < COUNT; start += PRODUCT_BATCH) {
    const size = Math.min(PRODUCT_BATCH, COUNT - start);
    const productValues: ProductInsert[] = [];
    const perProductImages: Omit<ImageInsert, "productId">[][] = [];
    const perProductTags: Omit<TagInsert, "productId">[][] = [];

    for (let k = 0; k < size; k += 1) {
      const globalIndex = offset + start + k + 1;
      const meta = pick(rnd, usable);
      const pool = pools[meta.slug];
      const noun = pick(rnd, meta.nouns);
      const brand = rnd() < 0.8 ? pick(rnd, meta.brands) : null;
      const descriptor = pick(rnd, meta.descriptors);
      const title = `${descriptor} ${noun}`.replace(/\s+/g, " ").slice(0, 120);
      const condition = pick(rnd, CONDITIONS) as Condition;
      const listingType = pick(rnd, LISTING_TYPES) as ListingType;
      const location = pick(rnd, LOCATIONS);

      const buyPrice = randInt(rnd, meta.buy[0], meta.buy[1]);
      const dayPrice = randInt(rnd, meta.day[0], meta.day[1]);
      const weekPrice = Math.round(dayPrice * 5.5);
      const monthPrice = Math.round(dayPrice * 18);
      const deposit = Math.round(dayPrice * randInt(rnd, 3, 10));
      const wantsRent = listingType !== "SALE";
      const wantsBuy = listingType !== "RENT";
      const rentToOwn = wantsRent && rnd() < 0.25;

      const imageCount = randInt(rnd, 3, 5);
      const images = pickImages(rnd, pool, imageCount);
      const tags = Array.from(
        new Set([
          meta.slug,
          ...noun.split(" ").filter((w) => w.length > 3),
          ...meta.tags.slice(0, randInt(rnd, 1, meta.tags.length)),
          condition.toLowerCase().replace("_", "-"),
        ]),
      ).slice(0, 5);

      const created = new Date(now - randInt(rnd, 1, 400) * 24 * 60 * 60 * 1000);
      const viewCount = randInt(rnd, 5, 3200);
      const favoriteCount = Math.floor(viewCount * rnd() * 0.08);
      const ratingCount = condition === "NEW" ? randInt(rnd, 0, 4) : randInt(rnd, 1, 60);

      productValues.push({
        sellerId: pick(rnd, sellerIds),
        title,
        slug: `${slugify(title)}-p${globalIndex}`,
        description:
          `${title} in ${condition.toLowerCase().replace("_", " ")} condition, listed from ${location}. ` +
          `${brand ? `Brand: ${brand}. ` : ""}` +
          `${wantsRent ? "Available for rent with flexible daily/weekly rates; " : ""}` +
          `${wantsBuy ? "also open to a straight purchase; " : ""}` +
          `message the seller to arrange pickup or delivery.`,
        categoryId: categoryIdBySlug.get(meta.slug)!,
        brand,
        condition,
        listingType,
        status: "PUBLISHED",
        location,
        purchasePrice: wantsBuy ? paise(buyPrice) : null,
        rentalPricePerDay: wantsRent ? paise(dayPrice) : null,
        rentalPricePerWeek: wantsRent ? paise(weekPrice) : null,
        rentalPricePerMonth: wantsRent ? paise(monthPrice) : null,
        securityDeposit: wantsRent ? paise(deposit) : null,
        minimumRentalDays: wantsRent ? randInt(rnd, 1, 3) : null,
        maximumRentalDays: wantsRent ? randInt(rnd, 15, 90) : null,
        rentToOwnEnabled: rentToOwn,
        rentToOwnPrice: rentToOwn ? paise(Math.round(buyPrice * 1.15)) : null,
        rentCreditPercentage: rentToOwn ? randInt(rnd, 20, 50) : null,
        rentCreditCap: rentToOwn
          ? paise(Math.round((buyPrice * randInt(rnd, 40, 70)) / 100))
          : null,
        quantity: 1,
        availableQuantity: 1,
        viewCount,
        favoriteCount,
        ratingAverage: ratingCount > 0 ? Math.round((3.6 + rnd() * 1.4) * 10) / 10 : 0,
        ratingCount,
        allowsDelivery: rnd() < 0.7,
        allowsPickup: true,
        createdAt: created,
        updatedAt: created,
      });

      // Image 0 is the primary image; the rest are alternative images with alt text.
      perProductImages.push(
        images.map((img, idx) => ({
          url: img.url.slice(0, 500),
          sortOrder: idx,
          altText: (img.alt || title).slice(0, 200),
        })),
      );
      perProductTags.push(tags.map((tag) => ({ tag: tag.slice(0, 40) })));
    }

    const ids = (await db.insert(products).values(productValues).$returningId()).map((r) =>
      Number(r.id),
    );

    const imageValues: ImageInsert[] = [];
    const tagValues: TagInsert[] = [];
    ids.forEach((productId, i) => {
      for (const img of perProductImages[i]) imageValues.push({ ...img, productId });
      for (const tag of perProductTags[i]) tagValues.push({ ...tag, productId });
    });

    for (const batch of chunk(imageValues, CHILD_BATCH))
      await db.insert(productImages).values(batch);
    for (const batch of chunk(tagValues, CHILD_BATCH)) await db.insert(productTags).values(batch);

    inserted += ids.length;
    imageRows += imageValues.length;
    tagRows += tagValues.length;
    process.stdout.write(`\r  products ${inserted}/${COUNT}  images ${imageRows}  tags ${tagRows}`);
  }

  console.log(`\nDone. products=${inserted} images=${imageRows} tags=${tagRows}`);
}

main()
  .catch((err) => {
    console.error("Product seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
