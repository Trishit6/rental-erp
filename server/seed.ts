import "dotenv/config";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import {
  categories,
  conversationParticipants,
  conversations,
  favorites,
  messages,
  notifications,
  orderItems,
  orders,
  productImages,
  products,
  productTags,
  rentals,
  reviews,
  sellerProfiles,
  transactions,
  users,
} from "./schema";
import { effectiveDailyRate, rentalDays } from "../src/lib/pricing";

/* --------------------------------- helpers --------------------------------- */

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function paise(rupees: number): number {
  return Math.round(rupees * 100);
}

const IMG = (seed: string) =>
  `https://storage.googleapis.com/banani-generated-images/generated-images/${seed}.jpg`;

/* ------------------------------- seed accounts ------------------------------ */

const PASSWORD = "revaro-dev-2026";

async function seed() {
  console.log("Clearing existing data...");
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of [
    "transactions",
    "notifications",
    "messages",
    "conversation_participants",
    "conversations",
    "reviews",
    "rentals",
    "order_items",
    "orders",
    "cart_items",
    "carts",
    "favorites",
    "product_tags",
    "product_images",
    "products",
    "reports",
    "seller_profiles",
    "addresses",
    "sessions",
    "categories",
    "users",
  ]) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${table}`));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);

  console.log("Seeding users...");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const insertedUsers = await db
    .insert(users)
    .values([
      {
        name: "Admin Revaro",
        email: "admin@revaro.local",
        passwordHash,
        role: "ADMIN",
        verified: true,
      },
      {
        name: "Maya Sharma",
        email: "seller@revaro.local",
        passwordHash,
        role: "SELLER",
        verified: true,
        avatarUrl: null,
      },
      {
        name: "Daniel Kapoor",
        email: "daniel@revaro.local",
        passwordHash,
        role: "SELLER",
        verified: true,
      },
      {
        name: "Priya Verma",
        email: "priya@revaro.local",
        passwordHash,
        role: "SELLER",
        verified: false,
      },
      {
        name: "Arjun Mehta",
        email: "buyer@revaro.local",
        passwordHash,
        role: "USER",
        verified: true,
      },
      { name: "Sara Iyer", email: "sara@revaro.local", passwordHash, role: "USER", verified: true },
    ])
    .$returningId();

  const [, maya, daniel, priya, arjun, sara] = insertedUsers.map((u) => Number(u.id));

  await db.insert(sellerProfiles).values([
    {
      userId: maya,
      bio: "Curator of Scandinavian furniture and homeware.",
      responseRateHours: 2,
      verified: true,
    },
    {
      userId: daniel,
      bio: "Photographer letting go of extra gear.",
      responseRateHours: 4,
      verified: true,
    },
    {
      userId: priya,
      bio: "Fashion and party-wear rentals.",
      responseRateHours: 8,
      verified: false,
    },
  ]);

  console.log("Seeding categories...");

  //
  // Two levels: parents first (parentId NULL), then their children. Child rows have
  // to be inserted after the parent exists, so the ids are resolved between the two
  // inserts. `icon` is a whitelist key the client maps to a Lucide glyph — never a
  // component name — and `imageUrl` reuses the real harvested Unsplash pools so a
  // category tile shows a genuine product photo instead of an invented one.
  //
  type CategorySeed = {
    slug: string;
    name: string;
    description: string;
    icon: string;
    sortOrder: number;
    isFeatured?: boolean;
    parentSlug?: string;
  };

  const CATEGORY_SEED: CategorySeed[] = [
    {
      slug: "electronics",
      name: "Electronics",
      description: "Laptops, phones, cameras and audio you can rent or own",
      icon: "laptop",
      sortOrder: 1,
      isFeatured: true,
    },
    {
      slug: "furniture",
      name: "Furniture",
      description: "Sofas, chairs, tables and storage for every room",
      icon: "sofa",
      sortOrder: 2,
      isFeatured: true,
    },
    {
      slug: "home",
      name: "Home",
      description: "Appliances and everyday essentials for the household",
      icon: "house",
      sortOrder: 3,
      isFeatured: true,
    },
    {
      slug: "fashion",
      name: "Fashion",
      description: "Occasion wear, outerwear and statement pieces",
      icon: "shirt",
      sortOrder: 4,
      isFeatured: true,
    },
    {
      slug: "gaming",
      name: "Gaming",
      description: "Consoles, handhelds and accessories",
      icon: "gamepad",
      sortOrder: 5,
      isFeatured: true,
    },
    {
      slug: "sports",
      name: "Sports",
      description: "Gear for the weekend and the season",
      icon: "dumbbell",
      sortOrder: 6,
    },
    {
      slug: "music",
      name: "Music",
      description: "Instruments and studio gear",
      icon: "music",
      sortOrder: 7,
    },
    {
      slug: "tools",
      name: "Tools",
      description: "DIY, workshop and garden equipment",
      icon: "wrench",
      sortOrder: 8,
    },
    {
      slug: "vehicles",
      name: "Vehicles",
      description: "Bikes, scooters and rides",
      icon: "bike",
      sortOrder: 9,
    },
    // Subcategories.
    {
      slug: "laptops",
      name: "Laptops",
      description: "Work, gaming and ultrabooks",
      icon: "laptop",
      sortOrder: 1,
      parentSlug: "electronics",
    },
    {
      slug: "phones",
      name: "Phones",
      description: "Smartphones and tablets",
      icon: "smartphone",
      sortOrder: 2,
      parentSlug: "electronics",
    },
    {
      slug: "cameras",
      name: "Cameras",
      description: "Bodies, lenses and camera gear",
      icon: "camera",
      sortOrder: 3,
      parentSlug: "electronics",
    },
    {
      slug: "audio",
      name: "Audio",
      description: "Headphones, speakers and soundbars",
      icon: "headphones",
      sortOrder: 4,
      parentSlug: "electronics",
    },
    {
      slug: "appliances",
      name: "Appliances",
      description: "Kitchen and cleaning",
      icon: "washing-machine",
      sortOrder: 1,
      parentSlug: "home",
    },
    {
      slug: "outdoor",
      name: "Outdoor",
      description: "Camping, hiking and garden",
      icon: "tent",
      sortOrder: 1,
      parentSlug: "sports",
    },
  ];

  // Real Unsplash URLs already harvested for the bulk seeder; a category whose pool
  // is missing simply keeps a null image and falls back to its icon on the client.
  const imagePools: Record<string, { url: string }[]> = (() => {
    try {
      return JSON.parse(
        readFileSync(new URL("./data/product-images.json", import.meta.url), "utf8"),
      ) as Record<string, { url: string }[]>;
    } catch {
      return {};
    }
  })();

  const parents = CATEGORY_SEED.filter((category) => !category.parentSlug);
  const children = CATEGORY_SEED.filter((category) => category.parentSlug);

  const insertCategoryRows = (rows: CategorySeed[]) =>
    db
      .insert(categories)
      .values(
        rows.map((row) => ({
          name: row.name,
          slug: row.slug,
          description: row.description,
          icon: row.icon,
          imageUrl: imagePools[row.slug]?.[0]?.url ?? null,
          sortOrder: row.sortOrder,
          isFeatured: row.isFeatured ?? false,
          isActive: true,
        })),
      )
      .$returningId();

  const insertedParents = await insertCategoryRows(parents);
  const parentIdBySlug = new Map(
    parents.map((parent, index) => [parent.slug, Number(insertedParents[index]!.id)]),
  );

  const insertedChildren = await db
    .insert(categories)
    .values(
      children.map((child) => ({
        name: child.name,
        slug: child.slug,
        description: child.description,
        icon: child.icon,
        imageUrl: imagePools[child.slug]?.[0]?.url ?? null,
        parentId: child.parentSlug ? (parentIdBySlug.get(child.parentSlug) ?? null) : null,
        sortOrder: child.sortOrder,
        isFeatured: child.isFeatured ?? false,
        isActive: true,
      })),
    )
    .$returningId();

  // Slug → id for the demo products below (parents and children alike).
  const cat = Object.fromEntries([
    ...parents.map((row, index) => [row.slug, Number(insertedParents[index]!.id)]),
    ...children.map((row, index) => [row.slug, Number(insertedChildren[index]!.id)]),
  ]) as Record<string, number>;

  console.log("Seeding products...");
  type SeedProduct = {
    sellerId: number;
    title: string;
    description: string;
    categoryId: number;
    brand?: string;
    condition: "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "USED";
    listingType: "SALE" | "RENT" | "BOTH";
    location: string;
    purchasePrice?: number;
    rentalPricePerDay?: number;
    rentalPricePerWeek?: number;
    rentalPricePerMonth?: number;
    securityDeposit?: number;
    quantity?: number;
    tags: string[];
    images: string[];
    rentToOwnEnabled?: boolean;
    rentCreditPercentage?: number;
    rentCreditCap?: number;
  };

  const seedProducts: SeedProduct[] = [
    {
      sellerId: maya,
      title: "Scandinavian lounge chair",
      description:
        "A soft, sculptural lounge chair in warm oak and oatmeal boucle. Barely used, from a pet-free, smoke-free home. Perfect reading corner companion.",
      categoryId: cat.furniture,
      brand: "Urban Ladder",
      condition: "LIKE_NEW",
      listingType: "BOTH",
      location: "Indiranagar, Bengaluru",
      purchasePrice: 1850000,
      rentalPricePerDay: 180000,
      rentalPricePerWeek: 950000,
      rentalPricePerMonth: 3200000,
      securityDeposit: 500000,
      tags: ["chair", "living room", "oak"],
      images: [IMG("91925daa-c0cc-4433-acd1-386d9d547a41")],
      rentToOwnEnabled: true,
      rentCreditPercentage: 40,
      rentCreditCap: 800000,
    },
    {
      sellerId: daniel,
      title: "Sony mirrorless camera kit",
      description:
        "Sony Alpha mirrorless body with 28-70mm kit lens. Shutter count under 9k. Comes with two batteries, 64GB card and a padded sling bag.",
      categoryId: cat.cameras,
      brand: "Sony",
      condition: "GOOD",
      listingType: "BOTH",
      location: "Koramangala, Bengaluru",
      purchasePrice: 8900000,
      rentalPricePerDay: 320000,
      rentalPricePerWeek: 1750000,
      securityDeposit: 2000000,
      tags: ["camera", "mirrorless", "travel"],
      images: [IMG("da002d33-6b69-477b-a748-f651770721ce")],
    },
    {
      sellerId: maya,
      title: "Solid oak coffee table",
      description:
        "Sturdy solid-oak coffee table with a lower shelf. A couple of honest rings on the surface, nothing a table runner can't hide.",
      categoryId: cat.furniture,
      condition: "GOOD",
      listingType: "BOTH",
      location: "HSR Layout, Bengaluru",
      purchasePrice: 2800000,
      rentalPricePerDay: 120000,
      securityDeposit: 400000,
      tags: ["table", "living room", "oak"],
      images: [IMG("25b9256c-9abe-420e-b116-629eaebfc17a")],
    },
    {
      sellerId: priya,
      title: "Classic linen trench coat",
      description:
        "Breathable linen trench in a warm sand tone. Worn twice. Fits sizes M-L. Ideal for weddings and city strolls.",
      categoryId: cat.fashion,
      brand: "Zara",
      condition: "LIKE_NEW",
      listingType: "RENT",
      location: "Bandra West, Mumbai",
      rentalPricePerDay: 140000,
      securityDeposit: 100000,
      tags: ["coat", "occasion", "linen"],
      images: [IMG("0bf31d50-1e71-4a86-9c17-4a86-9c17")],
    },
    {
      sellerId: daniel,
      title: "Electric cargo bike",
      description:
        "Long-tail e-cargo bike with child seat and rain canopy. 80km range, hydraulic brakes. Weekend family rides made easy.",
      categoryId: cat.vehicles,
      brand: "Hero",
      condition: "GOOD",
      listingType: "RENT",
      location: "Koramangala, Bengaluru",
      rentalPricePerDay: 380000,
      rentalPricePerWeek: 2100000,
      rentalPricePerMonth: 6800000,
      securityDeposit: 5000000,
      tags: ["bike", "family", "electric"],
      images: [IMG("cb443dc6-a949-4dc5-b9ed-fcf11ff4aee1")],
    },
    {
      sellerId: maya,
      title: "Cordless stick vacuum",
      description:
        "Lightweight cordless stick vacuum with two batteries and a wall mount. Great for apartments with pets.",
      categoryId: cat.appliances,
      brand: "Dyson",
      condition: "GOOD",
      listingType: "SALE",
      location: "Indiranagar, Bengaluru",
      purchasePrice: 2400000,
      quantity: 2,
      tags: ["vacuum", "cleaning"],
      images: [IMG("72ff8683-4ce4-be15-7eb706a6bcfe")],
    },
    {
      sellerId: daniel,
      title: "Acoustic guitar, natural wood",
      description:
        "Full-size steel-string acoustic with a warm, balanced tone. Includes padded gig bag, capo and spare strings.",
      categoryId: cat.music,
      brand: "Yamaha",
      condition: "GOOD",
      listingType: "BOTH",
      location: "Jayangar, Bengaluru",
      purchasePrice: 3600000,
      rentalPricePerDay: 160000,
      securityDeposit: 800000,
      tags: ["guitar", "music", "acoustic"],
      images: [IMG("582873f9-3976-4166-b024-eb7706a6bcfe")],
    },
    {
      sellerId: maya,
      title: "Portable 4K projector",
      description:
        "Pocket-sized 4K projector with built-in streaming apps and stereo speakers. Movie nights on any wall.",
      categoryId: cat.electronics,
      brand: "Xgimi",
      condition: "LIKE_NEW",
      listingType: "RENT",
      location: "Whitefield, Bengaluru",
      rentalPricePerDay: 220000,
      rentalPricePerWeek: 1200000,
      securityDeposit: 1500000,
      tags: ["projector", "movie", "party"],
      images: [IMG("c0024048-b9e1-b61d-834dbeb61e1")],
    },
    {
      sellerId: priya,
      title: "Gaming laptop RTX 4060",
      description:
        "RTX 4060 gaming laptop, 16GB RAM, 1TB SSD. Runs every current title at high settings. Charger and cooling pad included.",
      categoryId: cat.gaming,
      brand: "ASUS",
      condition: "GOOD",
      listingType: "BOTH",
      location: "Powai, Mumbai",
      purchasePrice: 9800000,
      rentalPricePerDay: 450000,
      rentalPricePerWeek: 2600000,
      securityDeposit: 3000000,
      tags: ["laptop", "gaming", "rtx"],
      images: [IMG("81111111-1111-1111-1111-111111111111")],
    },
    {
      sellerId: daniel,
      title: "DSLR 50mm prime lens",
      description:
        "Fast 50mm f/1.8 prime. Lovely bokeh for portraits and low light. Compatible with Canon EF mounts.",
      categoryId: cat.cameras,
      brand: "Canon",
      condition: "LIKE_NEW",
      listingType: "RENT",
      location: "Koramangala, Bengaluru",
      rentalPricePerDay: 90000,
      securityDeposit: 500000,
      tags: ["lens", "portrait", "prime"],
      images: [IMG("22222222-2222-2222-2222-222222222222")],
    },
    {
      sellerId: priya,
      title: "Gaming console + two controllers",
      description:
        "Latest-gen console with two controllers and three included games. HDMI cable and stand provided.",
      categoryId: cat.gaming,
      brand: "Sony",
      condition: "LIKE_NEW",
      listingType: "RENT",
      location: "Bandra West, Mumbai",
      rentalPricePerDay: 350000,
      rentalPricePerWeek: 1900000,
      securityDeposit: 2500000,
      tags: ["console", "gaming", "party"],
      images: [IMG("33333333-3333-3333-3333-333333333333")],
    },
    {
      sellerId: maya,
      title: "Ergonomic office chair",
      description:
        "Mesh-back ergonomic chair with adjustable lumbar support and armrests. Work-from-home upgrade.",
      categoryId: cat.furniture,
      brand: "Featherlite",
      condition: "GOOD",
      listingType: "BOTH",
      location: "Indiranagar, Bengaluru",
      purchasePrice: 1450000,
      rentalPricePerDay: 90000,
      rentalPricePerMonth: 1900000,
      securityDeposit: 500000,
      tags: ["chair", "office", "ergonomic"],
      images: [IMG("44444444-4444-4444-4444-444444444444")],
    },
    {
      sellerId: daniel,
      title: "Three-seater fabric sofa",
      description:
        "Deep-seated three seater in dove grey weave. Professionally cleaned before listing. Cushions included.",
      categoryId: cat.furniture,
      condition: "GOOD",
      listingType: "SALE",
      location: "HSR Layout, Bengaluru",
      purchasePrice: 3200000,
      quantity: 1,
      tags: ["sofa", "living room"],
      images: [IMG("55555555-5555-5555-5555-555555555555")],
    },
    {
      sellerId: priya,
      title: "Cordless drill + 40 accessories",
      description:
        "20V cordless drill with two batteries, charger bit set, spade bits and anchors. Covers almost every home job.",
      categoryId: cat.tools,
      brand: "Bosch",
      condition: "GOOD",
      listingType: "BOTH",
      location: "Powai, Mumbai",
      purchasePrice: 680000,
      rentalPricePerDay: 80000,
      securityDeposit: 300000,
      tags: ["drill", "diy", "tools"],
      images: [IMG("66666666-6666-6666-6666-666666666666")],
    },
    {
      sellerId: maya,
      title: "Camping tent 4-person",
      description:
        "Double-layer 4-person dome tent with rainfly. Pitches in ten minutes. Includes footprint and stake set.",
      categoryId: cat.outdoor,
      condition: "GOOD",
      listingType: "RENT",
      location: "Whitefield, Bengaluru",
      rentalPricePerDay: 70000,
      rentalPricePerWeek: 380000,
      securityDeposit: 200000,
      tags: ["camping", "tent", "trek"],
      images: [IMG("77777777-7777-7777-7777-777777777777")],
    },
    {
      sellerId: daniel,
      title: "Stand mixer, 5L",
      description:
        "Die-cast 5L stand mixer with dough hook, whisk and beater. Baking weekend, anyone?",
      categoryId: cat.appliances,
      brand: "Philips",
      condition: "LIKE_NEW",
      listingType: "BOTH",
      location: "Koramangala, Bengaluru",
      purchasePrice: 1800000,
      rentalPricePerDay: 110000,
      securityDeposit: 600000,
      tags: ["baking", "kitchen"],
      images: [IMG("88888888-8888-8888-8888-888888888888")],
    },
    {
      sellerId: priya,
      title: "Formal suit, charcoal",
      description:
        "Tailored charcoal two-piece suit, size 40R. Worn once for a wedding. Dry-cleaned and ready.",
      categoryId: cat.fashion,
      brand: "Louis Philippe",
      condition: "LIKE_NEW",
      listingType: "RENT",
      location: "Bandra West, Mumbai",
      rentalPricePerDay: 190000,
      securityDeposit: 150000,
      tags: ["suit", "wedding", "formal"],
      images: [IMG("99999999-9999-9999-9999-999999999999")],
    },
    {
      sellerId: maya,
      title: "Air fryer 4L",
      description:
        "4L digital air fryer with rapid-air technology. Great for quick weeknight dinners.",
      categoryId: cat.appliances,
      brand: "Instant",
      condition: "GOOD",
      listingType: "SALE",
      location: "Indiranagar, Bengaluru",
      purchasePrice: 750000,
      quantity: 3,
      tags: ["kitchen", "air fryer"],
      images: [IMG("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")],
    },
    {
      sellerId: daniel,
      title: "Mountain bike, 27.5 inch",
      description:
        "Lightweight alloy MTB with disc brakes and front suspension. Recently serviced with new brake pads.",
      categoryId: cat.vehicles,
      brand: "Firefox",
      condition: "GOOD",
      listingType: "BOTH",
      location: "Jayangar, Bengaluru",
      purchasePrice: 2200000,
      rentalPricePerDay: 150000,
      securityDeposit: 1000000,
      tags: ["bike", "mtb", "weekend"],
      images: [IMG("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")],
    },
    {
      sellerId: priya,
      title: "Yoga mat + blocks set",
      description:
        "6mm eco-TPE yoga mat with two cork blocks and a strap. Perfect for home practice or studio classes.",
      categoryId: cat.sports,
      condition: "LIKE_NEW",
      listingType: "RENT",
      location: "Powai, Mumbai",
      rentalPricePerDay: 40000,
      securityDeposit: 100000,
      tags: ["yoga", "fitness"],
      images: [IMG("cccccccc-cccc-cccc-cccc-cccccccccccc")],
    },
    {
      sellerId: maya,
      title: "Party speaker, 80W",
      description:
        "80W Bluetooth party speaker with lights and mic input. Up to 12 hours of playtime.",
      categoryId: cat.electronics,
      brand: "JBL",
      condition: "GOOD",
      listingType: "RENT",
      location: "HSR Layout, Bengaluru",
      rentalPricePerDay: 130000,
      securityDeposit: 800000,
      tags: ["speaker", "party", "music"],
      images: [IMG("dddddddd-dddd-dddd-dddd-dddddddddddd")],
    },
    {
      sellerId: daniel,
      title: "Telescope, 114mm reflector",
      description:
        "114mm Newtonian reflector with tripod and two eyepieces. Great for moon and planet nights.",
      categoryId: cat.electronics,
      brand: "Celestron",
      condition: "GOOD",
      listingType: "BOTH",
      location: "Whitefield, Bengaluru",
      purchasePrice: 1600000,
      rentalPricePerDay: 120000,
      securityDeposit: 700000,
      tags: ["telescope", "stars", "kids"],
      images: [IMG("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")],
    },
  ];

  const insertedProducts = await db
    .insert(products)
    .values(
      seedProducts.map((p, i) => ({
        sellerId: p.sellerId,
        title: p.title,
        slug:
          p.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") + `-${i + 1}`,
        description: p.description,
        categoryId: p.categoryId,
        brand: p.brand ?? null,
        condition: p.condition,
        listingType: p.listingType,
        status: "PUBLISHED",
        location: p.location,
        purchasePrice: p.purchasePrice ? paise(p.purchasePrice) : null,
        rentalPricePerDay: p.rentalPricePerDay ? paise(p.rentalPricePerDay) : null,
        rentalPricePerWeek: p.rentalPricePerWeek ? paise(p.rentalPricePerWeek) : null,
        rentalPricePerMonth: p.rentalPricePerMonth ? paise(p.rentalPricePerMonth) : null,
        securityDeposit: p.securityDeposit ? paise(p.securityDeposit) : null,
        rentToOwnEnabled: p.rentToOwnEnabled ?? false,
        rentCreditPercentage: p.rentCreditPercentage ?? null,
        rentCreditCap: p.rentCreditCap ? paise(p.rentCreditCap) : null,
        quantity: p.quantity ?? 1,
        availableQuantity: p.quantity ?? 1,
        viewCount: Math.floor(Math.random() * 400) + 40,
        favoriteCount: 0,
        ratingAverage: 4.2 + Math.random() * 0.7,
        ratingCount: Math.floor(Math.random() * 30) + 3,
      })),
    )
    .$returningId();

  console.log("Seeding product images + tags...");
  await db.insert(productImages).values(
    seedProducts.flatMap((p, i) =>
      p.images.map((url, idx) => ({
        productId: Number(insertedProducts[i].id),
        url,
        sortOrder: idx,
        altText: p.title,
      })),
    ),
  );
  await db
    .insert(productTags)
    .values(
      seedProducts.flatMap((p, i) =>
        p.tags.map((tag) => ({ productId: Number(insertedProducts[i].id), tag })),
      ),
    );

  console.log("Seeding orders, rentals, reviews...");
  const chairId = Number(insertedProducts[0].id);
  const cameraId = Number(insertedProducts[1].id);
  const projectorId = Number(insertedProducts[7].id);

  // Purchase: Arjun buys the vacuum
  const [order1] = await db
    .insert(orders)
    .values({
      userId: arjun,
      orderType: "PURCHASE",
      status: "DELIVERED",
      subtotal: paise(2400),
      deliveryFee: paise(49),
      depositTotal: 0,
      total: paise(2449),
      deliveryMethod: "DELIVERY",
      paymentProvider: "mock",
      paymentReference: "mock_seed_001",
      createdAt: daysFromNow(-21),
    })
    .$returningId();
  await db.insert(orderItems).values({
    orderId: Number(order1.id),
    productId: Number(insertedProducts[5].id),
    sellerId: maya,
    mode: "BUY",
    quantity: 1,
    unitPrice: paise(2400),
    lineTotal: paise(2400),
    titleSnapshot: seedProducts[5].title,
    createdAt: daysFromNow(-21),
  });
  await db.insert(transactions).values({
    userId: arjun,
    orderId: Number(order1.id),
    type: "PAYMENT",
    amount: paise(2449),
    status: "SUCCEEDED",
    provider: "mock",
    providerTransactionId: "mock_seed_001",
    createdAt: daysFromNow(-21),
  });

  // Rental: Sara rents the camera, active now
  const camStart = daysFromNow(-3);
  const camEnd = daysFromNow(4);
  const camDays = rentalDays({ startDate: camStart, endDate: camEnd });
  const camRate = effectiveDailyRate(
    {
      rentalPricePerDay: paise(3200),
      rentalPricePerWeek: paise(17500),
      rentalPricePerMonth: null,
      securityDeposit: paise(20000),
    },
    camDays,
  );
  const camSubtotal = camRate * camDays;
  const [order2] = await db
    .insert(orders)
    .values({
      userId: sara,
      orderType: "RENTAL",
      status: "COMPLETED",
      subtotal: camSubtotal,
      deliveryFee: paise(49),
      depositTotal: paise(20000),
      total: camSubtotal + paise(20000) + paise(49),
      deliveryMethod: "PICKUP",
      paymentProvider: "mock",
      paymentReference: "mock_seed_002",
      createdAt: daysFromNow(-4),
    })
    .$returningId();
  const [item2] = await db
    .insert(orderItems)
    .values({
      orderId: Number(order2.id),
      productId: cameraId,
      sellerId: daniel,
      mode: "RENT",
      quantity: 1,
      unitPrice: camRate,
      lineTotal: camSubtotal,
      titleSnapshot: seedProducts[1].title,
      startDate: camStart,
      endDate: camEnd,
      rentalDays: camDays,
      createdAt: daysFromNow(-4),
    })
    .$returningId();
  const [rental1] = await db
    .insert(rentals)
    .values({
      orderId: Number(order2.id),
      orderItemId: Number(item2.id),
      productId: cameraId,
      renterId: sara,
      ownerId: daniel,
      startDate: camStart,
      endDate: camEnd,
      dailyRate: camRate,
      rentalSubtotal: camSubtotal,
      securityDeposit: paise(20000),
      deliveryFee: 0,
      total: camSubtotal + paise(20000),
      status: "ACTIVE",
      createdAt: daysFromNow(-4),
    })
    .$returningId();

  // Upcoming rental: Arjun rents the projector
  const projStart = daysFromNow(6);
  const projEnd = daysFromNow(9);
  const projDays = rentalDays({ startDate: projStart, endDate: projEnd });
  const projRate = paise(2200);
  const projSubtotal = projRate * projDays;
  const [order3] = await db
    .insert(orders)
    .values({
      userId: arjun,
      orderType: "RENTAL",
      status: "PAID",
      subtotal: projSubtotal,
      deliveryFee: paise(49),
      depositTotal: paise(15000),
      total: projSubtotal + paise(15000) + paise(49),
      deliveryMethod: "DELIVERY",
      paymentProvider: "mock",
      paymentReference: "mock_seed_003",
      createdAt: daysFromNow(-1),
    })
    .$returningId();
  const [item3] = await db
    .insert(orderItems)
    .values({
      orderId: Number(order3.id),
      productId: projectorId,
      sellerId: maya,
      mode: "RENT",
      quantity: 1,
      unitPrice: projRate,
      lineTotal: projSubtotal,
      titleSnapshot: seedProducts[7].title,
      startDate: projStart,
      endDate: projEnd,
      rentalDays: projDays,
      createdAt: daysFromNow(-1),
    })
    .$returningId();
  await db.insert(rentals).values({
    orderId: Number(order3.id),
    orderItemId: Number(item3.id),
    productId: projectorId,
    renterId: arjun,
    ownerId: maya,
    startDate: projStart,
    endDate: projEnd,
    dailyRate: projRate,
    rentalSubtotal: projSubtotal,
    securityDeposit: paise(15000),
    deliveryFee: paise(49),
    total: projSubtotal + paise(15000) + paise(49),
    status: "CONFIRMED",
    createdAt: daysFromNow(-1),
  });

  await db.insert(reviews).values([
    {
      userId: arjun,
      productId: Number(insertedProducts[5].id),
      sellerId: maya,
      orderId: Number(order1.id),
      rating: 5,
      title: "Exactly as described",
      comment: "The vacuum works beautifully and Maya was lovely to deal with. Pickup was smooth.",
      createdAt: daysFromNow(-18),
    },
    {
      userId: sara,
      productId: cameraId,
      sellerId: daniel,
      rentalId: Number(rental1.id),
      rating: 5,
      title: "Great kit for a trip",
      comment: "Camera was clean, batteries healthy, and Daniel explained everything patiently.",
      createdAt: daysFromNow(-1),
    },
  ]);

  console.log("Seeding favorites, messages, notifications...");
  await db.insert(favorites).values([
    { userId: arjun, productId: chairId },
    { userId: arjun, productId: cameraId },
    { userId: sara, productId: chairId },
    { userId: sara, productId: Number(insertedProducts[2].id) },
  ]);
  await db
    .update(products)
    .set({ favoriteCount: 2 })
    .where(sql`${products.id} = ${chairId}`);
  await db
    .update(products)
    .set({ favoriteCount: 2 })
    .where(sql`${products.id} = ${cameraId}`);

  const [conv1] = await db.insert(conversations).values({ productId: cameraId }).$returningId();
  await db.insert(conversationParticipants).values([
    { conversationId: Number(conv1.id), userId: sara },
    { conversationId: Number(conv1.id), userId: daniel },
  ]);
  await db.insert(messages).values([
    {
      conversationId: Number(conv1.id),
      senderId: sara,
      body: "Hi Daniel! Is the camera available to rent next weekend?",
      createdAt: daysFromNow(-2),
    },
    {
      conversationId: Number(conv1.id),
      senderId: daniel,
      body: "Hey Sara! Yes, it is. Pickup from Koramangala works, or I can arrange delivery.",
      createdAt: daysFromNow(-2),
    },
  ]);

  await db.insert(notifications).values([
    {
      userId: daniel,
      type: "RENTAL_CONFIRMED",
      title: "Camera rented",
      body: "Sara rented your Sony camera kit.",
      link: "/dashboard/rentals",
      createdAt: daysFromNow(-4),
    },
    {
      userId: arjun,
      type: "RENTAL_STARTING_SOON",
      title: "Rental starting soon",
      body: "Your projector rental starts in 6 days.",
      link: "/dashboard/rentals",
      createdAt: daysFromNow(-1),
    },
    {
      userId: maya,
      type: "ORDER_NEW",
      title: "You have a new order",
      body: "Order delivered: Cordless stick vacuum.",
      link: "/dashboard/orders",
      createdAt: daysFromNow(-21),
    },
  ]);

  console.log("\nSeed complete!");
  console.log(`  Admin:  admin@revaro.local / ${PASSWORD}`);
  console.log(`  Seller: seller@revaro.local / ${PASSWORD}`);
  console.log(`  Buyer:  buyer@revaro.local / ${PASSWORD}`);
  console.log(`  Also:   daniel@revaro.local, priya@revaro.local, sara@revaro.local / ${PASSWORD}`);
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
