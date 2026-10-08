import "dotenv/config";
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
  payouts,
  permissions,
  productImages,
  products,
  productTags,
  rentals,
  reviews,
  reviewHelpfulVotes,
  rolePermissions,
  roles,
  sellerPayoutMethods,
  sellerProfiles,
  transactions,
  userRoles,
  users,
  walletTransactions,
} from "./schema";
import { effectiveDailyRate, platformFee, rentalDays } from "../src/lib/pricing";
import {
  DEV_ADMIN_EMAIL,
  DEV_ADMIN_PASSWORD,
  DEV_PASSWORD,
  PLATFORM_RENTAL_FEE_PERCENT,
  PLATFORM_SALE_FEE_PERCENT,
} from "./lib/config";
import { refreshProductRatings } from "./lib/rating-aggregate";
import { TRUNCATED_TABLES } from "./lib/seed-truncate";
import { ALL_ROLE_NAMES } from "./lib/enums";
import { createOrderNumber } from "./lib/payments/order-number";
import { createPayoutNumber } from "./lib/wallet";

/* --------------------------------- helpers --------------------------------- */

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function paise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Demo product photos.
 *
 * These used to point at a third-party GCS bucket
 * (`storage.googleapis.com/banani-generated-images/…`) by UUID. Eighteen of the
 * twenty-two demo products resolved to fabricated placeholder UUIDs
 * (`22222222-2222-2222-…`), which now answer `403`, so a fresh `pnpm db:seed`
 * produced a catalogue of broken images.
 *
 * They now come from `data/product-images.json` — the same Unsplash pool
 * `db:harvest-images` fills and `seed-products.ts` already uses — so the demo
 * world and the 20k bulk world share one image source, and that source is the
 * one `allowedImageHosts()` actually permits.
 *
 * The picker itself lives in `lib/demo-images`, not here, so that
 * `db:repair-demo-images` can recompute a URL that is provably identical to the
 * one this seed writes. A repair that disagreed with the seed would reintroduce
 * the same class of bug one re-seed later.
 *
 * `IMG` is keyed by the product's own category, so each demo product keeps a
 * stable picture across re-seeds. The category is passed at the call site rather
 * than read from the product row, because the `IMG(...)` entries sit in the same
 * object literal as `categoryId` and would otherwise need the row before it
 * exists.
 */
import { IMG, IMAGE_POOLS, pick } from "./lib/demo-images";

/* ------------------------------- seed accounts ------------------------------ */

/**
 * Every demo account's credentials come from `lib/config`, so a deployment can set
 * them in the environment instead of editing this file — see the note there.
 */
/* ----------------------------------- RBAC ---------------------------------- */

/**
 * The staff permission catalogue.
 *
 * Seeded rather than left empty: a permission table that starts blank is one
 * nobody notices staying blank. The first admin screen to check a key would
 * deny everyone, and the failure would look like an authentication bug instead
 * of missing data.
 *
 * Keys are `resource.action`, the shape `permissions.key` CHECKs for at the
 * database as well — a typo here fails the seed rather than becoming a
 * permission that can never be granted.
 */
const PERMISSIONS: { key: string; description: string }[] = [
  { key: "orders.view", description: "Read orders across sellers" },
  { key: "orders.manage", description: "Change order status and fulfillment" },
  { key: "orders.refund", description: "Issue a refund against an order" },
  { key: "products.view", description: "Read listings, including unpublished ones" },
  { key: "products.moderate", description: "Publish, pause or remove a listing" },
  { key: "users.view", description: "Read customer and seller accounts" },
  { key: "users.manage", description: "Suspend, restore and edit accounts" },
  { key: "payouts.view", description: "Read the payout ledger" },
  { key: "payouts.approve", description: "Approve or reject a payout" },
  { key: "support.view", description: "Read support tickets" },
  { key: "support.reply", description: "Reply to a support ticket" },
  { key: "reports.resolve", description: "Resolve or dismiss a report" },
  { key: "content.manage", description: "Edit banners and CMS blocks" },
  { key: "audit.view", description: "Read the audit log" },
  { key: "settings.manage", description: "Change platform settings and feature flags" },
  { key: "rbac.manage", description: "Grant and revoke roles and permissions" },
  { key: "exports.run", description: "Start a data export" },
];

/**
 * Which system role holds which key.
 *
 * `USER` and `SELLER` hold **none** on purpose. Their access comes from
 * `users.role` and the ownership checks that already exist; giving two systems
 * overlapping authority over the same endpoint is how a customer ends up with a
 * permission nobody granted them.
 *
 * `SUPER_ADMIN` is the only role with `rbac.manage`, and nothing is seeded into
 * it — unrestricted access should have to be handed out deliberately, not arrive
 * with the demo data.
 */
const ROLE_PERMISSIONS: Record<(typeof ALL_ROLE_NAMES)[number], readonly string[]> = {
  SUPER_ADMIN: PERMISSIONS.map((permission) => permission.key),
  ADMIN: PERMISSIONS.filter((permission) => permission.key !== "rbac.manage").map((p) => p.key),
  SUPPORT: [
    "orders.view",
    "users.view",
    "support.view",
    "support.reply",
    "reports.resolve",
    "exports.run",
  ],
  FINANCE: ["orders.view", "payouts.view", "payouts.approve", "audit.view", "exports.run"],
  MODERATOR: ["products.view", "products.moderate", "reports.resolve", "users.view", "support.view"],
  CONTENT_MANAGER: ["content.manage", "products.view"],
  USER: [],
  SELLER: [],
};

const ROLE_DESCRIPTIONS: Record<(typeof ALL_ROLE_NAMES)[number], string> = {
  SUPER_ADMIN: "Unrestricted access. Grants rbac.manage and must be assigned by hand.",
  ADMIN: "Full operational access, except granting roles.",
  SUPPORT: "Reads accounts and orders, answers tickets.",
  FINANCE: "Reads the ledger, approves payouts, reads the audit log.",
  MODERATOR: "Reviews listings and reports.",
  CONTENT_MANAGER: "Edits banners and CMS blocks.",
  USER: "A customer account — the coarse role on `users.role`.",
  SELLER: "A seller account — the coarse role on `users.role`.",
};

/**
 * Fills `roles`, `permissions`, `role_permissions` and grants the seeded
 * administrator their role.
 *
 * Runs inside `seed()` rather than at import, and after the truncate, so a
 * re-seed refreshes the catalogue instead of colliding with last run's rows.
 */
async function seedRbac(adminUserId: number): Promise<void> {
  const permissionRows = PERMISSIONS.map((permission) => ({
    key: permission.key,
    description: permission.description,
    // Everything a key can be about, read off the key itself rather than kept in
    // a second list that can drift from the first.
    groupKey: permission.key.slice(0, permission.key.indexOf(".")),
  }));
  const insertedPermissions = await db.insert(permissions).values(permissionRows).$returningId();
  const permissionIdByKey = new Map(
    permissionRows.map((permission, index) => [
      permission.key,
      Number(insertedPermissions[index].id),
    ]),
  );

  const roleRows = ALL_ROLE_NAMES.map((name) => ({
    name,
    description: ROLE_DESCRIPTIONS[name],
    isSystem: true,
  }));
  const insertedRoles = await db.insert(roles).values(roleRows).$returningId();
  const roleIdByName = new Map(roleRows.map((role, index) => [role.name, Number(insertedRoles[index].id)]));

  const grants = Object.entries(ROLE_PERMISSIONS).flatMap(([roleName, keys]) => {
    const roleId = roleIdByName.get(roleName as (typeof ALL_ROLE_NAMES)[number]);
    if (roleId === undefined) throw new Error(`RBAC seed: role "${roleName}" was not inserted`);
    return keys.map((key) => {
      const permissionId = permissionIdByKey.get(key);
      if (permissionId === undefined) {
        throw new Error(`RBAC seed: role "${roleName}" grants unknown permission "${key}"`);
      }
      return { roleId, permissionId };
    });
  });
  if (grants.length > 0) await db.insert(rolePermissions).values(grants);

  // `ADMIN`, not `SUPER_ADMIN`: the demo account matches its own `users.role`,
  // and unrestricted access is not something a `db:seed` should hand out.
  const adminRoleId = roleIdByName.get("ADMIN");
  if (adminRoleId === undefined) throw new Error("RBAC seed: ADMIN role is missing");
  await db.insert(userRoles).values({ userId: adminUserId, roleId: adminRoleId });
}

async function seed() {
  console.log("Clearing existing data...");
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of TRUNCATED_TABLES) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${table}`));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);

  console.log("Seeding users...");
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  // Hashed separately so `ADMIN_PASSWORD` can differ from the shared demo password.
  const adminPasswordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);
  const insertedUsers = await db
    .insert(users)
    .values([
      {
        name: "Admin Revaro",
        email: DEV_ADMIN_EMAIL,
        passwordHash: adminPasswordHash,
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

  const [admin, maya, daniel, priya, arjun, sara] = insertedUsers.map((u) => Number(u.id));

  console.log("Seeding RBAC...");
  await seedRbac(admin);

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

  const parents = CATEGORY_SEED.filter((category) => !category.parentSlug);
  const children = CATEGORY_SEED.filter((category) => category.parentSlug);

  /**
   * A category's photo.
   *
   * The harvested pools are keyed by top-level category, so `cameras`,
   * `appliances` and `outdoor` have their own while `laptops`, `phones` and
   * `audio` do not — those three would otherwise have shipped as `null` and
   * fallen back to their glyph on every category tile. A child borrows its
   * parent's pool, picked by its *own* slug so the three electronics children
   * get three different photos rather than one repeated across the row.
   */
  const categoryImage = (row: CategorySeed) => {
    const pool = IMAGE_POOLS[row.slug] ?? (row.parentSlug ? IMAGE_POOLS[row.parentSlug] : null);
    return pool?.length ? pick(pool, row.slug) : null;
  };

  const insertCategoryRows = (rows: CategorySeed[]) =>
    db
      .insert(categories)
      .values(
        rows.map((row) => ({
          name: row.name,
          slug: row.slug,
          description: row.description,
          icon: row.icon,
          imageUrl: categoryImage(row),
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
        imageUrl: categoryImage(child),
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
      images: [IMG("furniture", "Scandinavian lounge chair")],
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
      images: [IMG("cameras", "Sony mirrorless camera kit")],
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
      images: [IMG("furniture", "Solid oak coffee table")],
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
      images: [IMG("fashion", "Classic linen trench coat")],
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
      images: [IMG("vehicles", "Electric cargo bike")],
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
      images: [IMG("appliances", "Cordless stick vacuum")],
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
      images: [IMG("music", "Acoustic guitar, natural wood")],
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
      images: [IMG("electronics", "Portable 4K projector")],
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
      images: [IMG("gaming", "Gaming laptop RTX 4060")],
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
      images: [IMG("cameras", "DSLR 50mm prime lens")],
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
      images: [IMG("gaming", "Gaming console + two controllers")],
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
      images: [IMG("furniture", "Ergonomic office chair")],
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
      images: [IMG("furniture", "Three-seater fabric sofa")],
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
      images: [IMG("tools", "Cordless drill + 40 accessories")],
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
      images: [IMG("outdoor", "Camping tent 4-person")],
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
      images: [IMG("appliances", "Stand mixer, 5L")],
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
      images: [IMG("fashion", "Formal suit, charcoal")],
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
      images: [IMG("appliances", "Air fryer 4L")],
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
      images: [IMG("vehicles", "Mountain bike, 27.5 inch")],
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
      images: [IMG("sports", "Yoga mat + blocks set")],
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
      images: [IMG("electronics", "Party speaker, 80W")],
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
      images: [IMG("electronics", "Telescope, 114mm reflector")],
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
  // `IMG` can only return "" if a category has no pool *and* no pool exists at
  // all. Skip those rather than writing the empty string: `product_images.url`
  // is NOT NULL, and an empty URL is a card with a request for "" in it — the
  // exact broken-image state this seed used to ship.
  await db.insert(productImages).values(
    seedProducts.flatMap((p, i) =>
      p.images
        .filter((url) => url.length > 0)
        .map((url, idx) => ({
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
  const order1Number = createOrderNumber();
  const [order1] = await db
    .insert(orders)
    .values({
      userId: arjun,
      orderNumber: order1Number,
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
  const [item1] = await db
    .insert(orderItems)
    .values({
      orderId: Number(order1.id),
      productId: Number(insertedProducts[5].id),
      sellerId: maya,
      mode: "BUY",
      quantity: 1,
      unitPrice: paise(2400),
      lineTotal: paise(2400),
      titleSnapshot: seedProducts[5].title,
      createdAt: daysFromNow(-21),
    })
    .$returningId();
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
      orderNumber: createOrderNumber(),
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
  // No `$returningId()`: nothing downstream reads this rental's id, and asking
  // for it would imply the review that used to point here still exists.
  await db.insert(rentals).values({
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
  });

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
      orderNumber: createOrderNumber(),
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

  /*
   * Reviews.
   *
   * Every row points at a real order line — that is what `isVerifiedPurchase` means
   * here, and the unique index on `order_item_id` means the seed cannot quietly
   * write two reviews for the same thing. The demo also needs a *finished* rental
   * to review, because an active one is not reviewable (`RETURNED`/`COMPLETED`
   * are, per `server/lib/review-queries.ts`): hence orders 4 and 5 below, which
   * are dated in the past rather than reusing the live rental.
   */
  const chairStart = daysFromNow(-32);
  const chairEnd = daysFromNow(-30);
  const chairDays = rentalDays({ startDate: chairStart, endDate: chairEnd });
  const chairRate = paise(700);
  const chairSubtotal = chairRate * chairDays;
  const order4Number = createOrderNumber();
  const [order4] = await db
    .insert(orders)
    .values({
      userId: sara,
      orderNumber: order4Number,
      orderType: "RENTAL",
      status: "COMPLETED",
      subtotal: chairSubtotal,
      deliveryFee: 0,
      depositTotal: paise(5000),
      total: chairSubtotal + paise(5000),
      deliveryMethod: "PICKUP",
      paymentProvider: "mock",
      paymentReference: "mock_seed_004",
      createdAt: chairStart,
    })
    .$returningId();
  const [item4] = await db
    .insert(orderItems)
    .values({
      orderId: Number(order4.id),
      productId: chairId,
      sellerId: maya,
      mode: "RENT",
      quantity: 1,
      unitPrice: chairRate,
      lineTotal: chairSubtotal,
      titleSnapshot: seedProducts[0].title,
      startDate: chairStart,
      endDate: chairEnd,
      rentalDays: chairDays,
      createdAt: chairStart,
    })
    .$returningId();
  const [rental1] = await db
    .insert(rentals)
    .values({
      orderId: Number(order4.id),
      orderItemId: Number(item4.id),
      productId: chairId,
      renterId: sara,
      ownerId: maya,
      startDate: chairStart,
      endDate: chairEnd,
      dailyRate: chairRate,
      rentalSubtotal: chairSubtotal,
      securityDeposit: paise(5000),
      deliveryFee: 0,
      total: chairSubtotal + paise(5000),
      status: "RETURNED",
      createdAt: chairStart,
    })
    .$returningId();

  // A finished rental of the camera, so the live ACTIVE rental above stays active
  // and this one can carry a review. It is left HIDDEN on purpose: the admin queue
  // needs something real to moderate, and a hidden row must still be invisible on
  // the product page and out of the rating average.
  const pastStart = daysFromNow(-26);
  const pastEnd = daysFromNow(-24);
  const pastDays = rentalDays({ startDate: pastStart, endDate: pastEnd });
  const pastRate = effectiveDailyRate(
    {
      rentalPricePerDay: paise(3200),
      rentalPricePerWeek: paise(17500),
      rentalPricePerMonth: null,
      securityDeposit: paise(20000),
    },
    pastDays,
  );
  const pastSubtotal = pastRate * pastDays;
  const order5Number = createOrderNumber();
  const [order5] = await db
    .insert(orders)
    .values({
      userId: arjun,
      orderNumber: order5Number,
      orderType: "RENTAL",
      status: "COMPLETED",
      subtotal: pastSubtotal,
      deliveryFee: paise(49),
      depositTotal: paise(20000),
      total: pastSubtotal + paise(20000) + paise(49),
      deliveryMethod: "DELIVERY",
      paymentProvider: "mock",
      paymentReference: "mock_seed_005",
      createdAt: pastStart,
    })
    .$returningId();
  const [item5] = await db
    .insert(orderItems)
    .values({
      orderId: Number(order5.id),
      productId: cameraId,
      sellerId: daniel,
      mode: "RENT",
      quantity: 1,
      unitPrice: pastRate,
      lineTotal: pastSubtotal,
      titleSnapshot: seedProducts[1].title,
      startDate: pastStart,
      endDate: pastEnd,
      rentalDays: pastDays,
      createdAt: pastStart,
    })
    .$returningId();
  const [rental2] = await db
    .insert(rentals)
    .values({
      orderId: Number(order5.id),
      orderItemId: Number(item5.id),
      productId: cameraId,
      renterId: arjun,
      ownerId: daniel,
      startDate: pastStart,
      endDate: pastEnd,
      dailyRate: pastRate,
      rentalSubtotal: pastSubtotal,
      securityDeposit: paise(20000),
      deliveryFee: paise(49),
      total: pastSubtotal + paise(20000) + paise(49),
      status: "COMPLETED",
      createdAt: pastStart,
    })
    .$returningId();

  // `$returningId()` because the helpful votes below have to point at real review
  // ids — a vote row naming a review this seed did not write is a foreign-key
  // failure, and a vote row without a review has no meaning.
  const insertedReviews = await db
    .insert(reviews)
    .values([
      {
        userId: arjun,
        productId: Number(insertedProducts[5].id),
        sellerId: maya,
        orderId: Number(order1.id),
        orderItemId: Number(item1.id),
        purchaseType: "PURCHASE",
        rating: 5,
        title: "Exactly as described",
        comment:
          "The vacuum works beautifully and Maya was lovely to deal with. Pickup was smooth and it was spotless when I handed it back.",
        isVerifiedPurchase: true,
        status: "PUBLISHED",
        helpfulCount: 4,
        sellerReply:
          "Thank you Arjun — so glad it went well. It's back on the shelf and already spoken for!",
        sellerRepliedAt: daysFromNow(-16),
        createdAt: daysFromNow(-18),
      },
      {
        userId: sara,
        productId: chairId,
        sellerId: maya,
        orderId: Number(order4.id),
        orderItemId: Number(item4.id),
        purchaseType: "RENTAL",
        rating: 4,
        title: "Comfortable and easy to collect",
        comment:
          "Two days for a birthday party. The chair was comfortable and Maya let me pick it up a little early. Return took a minute.",
        isVerifiedPurchase: true,
        status: "PUBLISHED",
        helpfulCount: 2,
        isEdited: true,
        createdAt: daysFromNow(-29),
        updatedAt: daysFromNow(-28),
      },
      {
        userId: arjun,
        productId: cameraId,
        sellerId: daniel,
        orderId: Number(order5.id),
        orderItemId: Number(item5.id),
        rentalId: Number(rental2.id),
        purchaseType: "RENTAL",
        rating: 2,
        title: "Focus ring was sticky",
        comment: "The body was fine but the focus ring seized up in the cold.",
        isVerifiedPurchase: true,
        status: "HIDDEN",
        helpfulCount: 1,
        createdAt: daysFromNow(-23),
      },
    ])
    .$returningId();

  // "Helpful" votes behind those `helpfulCount` values.
  //
  // The counter above is a denormalised cache of `review_helpful_votes`, and the
  // API keeps the two in one transaction. Hand-writing a count with no votes behind
  // it leaves the number permanently disagreeing with the "did *this* viewer already
  // vote?" check — so the button shows 4 on a review that no row accounts for. The
  // counts are written first (to make the demo data look deliberate) and then
  // *justified* by inserting exactly that many votes, named rather than random so
  // the seeded world is the same on every run.
  //
  // Voters never include the review's own author: the endpoint refuses a self-vote
  // with a 400, so a self-voting row would be one the API itself could not produce.
  const [demoReviewVacuum, demoReviewChair, demoReviewCamera] = insertedReviews.map((row) =>
    Number(row.id),
  );
  await db.insert(reviewHelpfulVotes).values([
    // Arjun's 5-star vacuum review: 4 votes from the other demo accounts.
    { reviewId: demoReviewVacuum, userId: daniel },
    { reviewId: demoReviewVacuum, userId: priya },
    { reviewId: demoReviewVacuum, userId: maya },
    { reviewId: demoReviewVacuum, userId: sara },
    // Sara's chair rental review: 2.
    { reviewId: demoReviewChair, userId: arjun },
    { reviewId: demoReviewChair, userId: daniel },
    // Arjun's moderated camera review: 1. A hidden review keeps its votes — the
    // moderation decision hides it from the public page, it does not rewrite the
    // history of what readers thought of it.
    { reviewId: demoReviewCamera, userId: sara },
  ]);

  // Cached aggregates come from the same aggregation the API reads, so the badge
  // on a card and the summary on the product page agree from the very first load
  // instead of drifting until somebody writes a review. Only the listings this
  // block touched — re-aggregating the whole catalogue would be wasted work.
  await refreshProductRatings([Number(insertedProducts[5].id), chairId, cameraId]);

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

  /* ------------------------------ seller wallets ----------------------------- */

  /*
   * Financial records.
   *
   * ## These rows are written by hand, and that is a deliberate risk
   *
   * Everything in `wallet_transactions` and `payouts` below is inserted directly
   * rather than replayed through `recordEarning` / `requestPayout`. Replaying would
   * be more faithful, but it cannot produce history: the settlement delay, the
   * reversal and two payout outcomes all happened *in the past*, and the live helpers
   * only ever write "now". So the seed states the same invariants by hand, and the
   * invariants are:
   *
   *  - money is signed integer paise, credits positive and debits negative;
   *  - an earning and its fee are written **both** as `PENDING` and released together,
   *    so no fee can be left stranded in the settling bucket;
   *  - a reversal flips the originals to `REVERSED` **and** writes one `REFUND` row
   *    at the state the originals held — never an edit of the original;
   *  - a payout row mirrors the request's own lifecycle, and `PAYOUT_REVERSAL` is a
   *    memo that counts for nothing (the reservation is released by the payout
   *    leaving `PENDING`/`PROCESSING`, so counting the memo too would refund twice);
   *  - fees come from `platformFee` with the **live** configured percentages, so a
   *    seeded wallet cannot disagree with what the platform would really have taken.
   *
   * Priya is left with no wallet rows at all on purpose: an empty wallet is the
   * normal state for a seller who has not sold anything, and the page has to be
   * judged on that copy too.
   */
  console.log("Seeding seller wallets...");

  const saleFee = (grossPaise: number) => platformFee(grossPaise, PLATFORM_SALE_FEE_PERCENT);
  const rentalFee = (grossPaise: number) => platformFee(grossPaise, PLATFORM_RENTAL_FEE_PERCENT);

  const [mayaBank] = await db
    .insert(sellerPayoutMethods)
    .values({
      sellerId: maya,
      type: "BANK",
      accountHolder: "Maya Sharma",
      maskedLabel: "HDFC Bank •••• 4321",
      isDefault: true,
    })
    .$returningId();

  const [danielBank, danielUpi] = await db
    .insert(sellerPayoutMethods)
    .values([
      {
        sellerId: daniel,
        type: "BANK",
        accountHolder: "Daniel Kapoor",
        maskedLabel: "ICICI Bank •••• 7719",
        isDefault: true,
      },
      {
        sellerId: daniel,
        type: "UPI",
        accountHolder: "Daniel Kapoor",
        maskedLabel: "danielk@okaxis",
        isDefault: false,
      },
    ])
    .$returningId();

  // A sale delivered yesterday: still inside the settlement delay, so it is `PENDING`
  // and is *not* withdrawable. This is the row that makes the "Settling" card mean
  // something on a freshly seeded database.
  const airFryerId = Number(insertedProducts[17].id);
  const airFryerSoldAt = daysFromNow(-1);
  const airFryerNumber = createOrderNumber();
  const airFryerGross = paise(7500);
  const [order6] = await db
    .insert(orders)
    .values({
      userId: sara,
      orderNumber: airFryerNumber,
      orderType: "PURCHASE",
      status: "DELIVERED",
      subtotal: airFryerGross,
      deliveryFee: paise(49),
      depositTotal: 0,
      total: airFryerGross + paise(49),
      deliveryMethod: "DELIVERY",
      paymentProvider: "mock",
      paymentReference: "mock_seed_006",
      createdAt: airFryerSoldAt,
    })
    .$returningId();
  const [item6] = await db
    .insert(orderItems)
    .values({
      orderId: Number(order6.id),
      productId: airFryerId,
      sellerId: maya,
      mode: "BUY",
      quantity: 1,
      unitPrice: airFryerGross,
      lineTotal: airFryerGross,
      titleSnapshot: seedProducts[17].title,
      createdAt: airFryerSoldAt,
    })
    .$returningId();
  await db.insert(transactions).values({
    userId: sara,
    orderId: Number(order6.id),
    type: "PAYMENT",
    amount: airFryerGross + paise(49),
    status: "SUCCEEDED",
    provider: "mock",
    providerTransactionId: "mock_seed_006",
    createdAt: airFryerSoldAt,
  });

  // A rental that came back and was then cancelled, so support reversed the earning
  // nine days ago. Without this the seeded wallet has no `REFUND` row and no
  // `REVERSED` originals, and the two behaviours that matter most in an audit trail
  // are exactly the ones nothing exercises.
  const officeChairId = Number(insertedProducts[11].id);
  const chair2Start = daysFromNow(-12);
  const chair2End = daysFromNow(-10);
  const chair2Days = rentalDays({ startDate: chair2Start, endDate: chair2End });
  const chair2Rate = paise(900);
  const chair2Gross = chair2Rate * chair2Days;
  const order7Number = createOrderNumber();
  const [order7] = await db
    .insert(orders)
    .values({
      userId: arjun,
      orderNumber: order7Number,
      orderType: "RENTAL",
      status: "CANCELLED",
      subtotal: chair2Gross,
      deliveryFee: paise(49),
      depositTotal: paise(5000),
      total: chair2Gross + paise(5000) + paise(49),
      deliveryMethod: "DELIVERY",
      paymentProvider: "mock",
      paymentReference: "mock_seed_007",
      createdAt: chair2Start,
    })
    .$returningId();
  const [item7] = await db
    .insert(orderItems)
    .values({
      orderId: Number(order7.id),
      productId: officeChairId,
      sellerId: maya,
      mode: "RENT",
      quantity: 1,
      unitPrice: chair2Rate,
      lineTotal: chair2Gross,
      titleSnapshot: seedProducts[11].title,
      startDate: chair2Start,
      endDate: chair2End,
      rentalDays: chair2Days,
      createdAt: chair2Start,
    })
    .$returningId();
  const [rental3] = await db
    .insert(rentals)
    .values({
      orderId: Number(order7.id),
      orderItemId: Number(item7.id),
      productId: officeChairId,
      renterId: arjun,
      ownerId: maya,
      startDate: chair2Start,
      endDate: chair2End,
      dailyRate: chair2Rate,
      rentalSubtotal: chair2Gross,
      securityDeposit: paise(5000),
      deliveryFee: paise(49),
      total: chair2Gross + paise(5000) + paise(49),
      status: "CANCELLED",
      createdAt: chair2Start,
    })
    .$returningId();

  // Maya's ledger, oldest first.
  await db.insert(walletTransactions).values([
    {
      sellerId: maya,
      orderId: Number(order4.id),
      orderItemId: Number(item4.id),
      rentalId: Number(rental1.id),
      type: "RENTAL",
      amount: chairSubtotal,
      status: "AVAILABLE",
      description: `Rental of ${seedProducts[0].title} · ${chairDays} days`,
      reference: order4Number,
      idempotencyKey: `rental:${rental1.id}`,
      createdAt: chairStart,
    },
    {
      sellerId: maya,
      orderId: Number(order4.id),
      orderItemId: Number(item4.id),
      rentalId: Number(rental1.id),
      type: "PLATFORM_FEE",
      amount: -rentalFee(chairSubtotal),
      status: "AVAILABLE",
      description: `Platform fee on ${order4Number}`,
      reference: order4Number,
      idempotencyKey: `fee:rental:${rental1.id}`,
      createdAt: chairStart,
    },
    {
      sellerId: maya,
      orderId: Number(order1.id),
      orderItemId: Number(item1.id),
      type: "SALE",
      amount: paise(2400),
      status: "AVAILABLE",
      description: `Sold ${seedProducts[5].title}`,
      reference: order1Number,
      idempotencyKey: `sale:${item1.id}`,
      createdAt: daysFromNow(-21),
    },
    {
      sellerId: maya,
      orderId: Number(order1.id),
      orderItemId: Number(item1.id),
      type: "PLATFORM_FEE",
      amount: -saleFee(paise(2400)),
      status: "AVAILABLE",
      description: `Platform fee on ${order1Number}`,
      reference: order1Number,
      idempotencyKey: `fee:sale:${item1.id}`,
      createdAt: daysFromNow(-21),
    },
    {
      sellerId: maya,
      type: "ADJUSTMENT",
      amount: paise(150),
      status: "AVAILABLE",
      description: "Goodwill credit for a delayed collection",
      reference: null,
      idempotencyKey: "adjustment:seed-goodwill-1",
      createdAt: daysFromNow(-6),
    },
    {
      sellerId: maya,
      orderId: Number(order6.id),
      orderItemId: Number(item6.id),
      type: "SALE",
      amount: airFryerGross,
      status: "PENDING",
      description: `Sold ${seedProducts[17].title}`,
      reference: airFryerNumber,
      idempotencyKey: `sale:${item6.id}`,
      createdAt: airFryerSoldAt,
    },
    {
      sellerId: maya,
      orderId: Number(order6.id),
      orderItemId: Number(item6.id),
      type: "PLATFORM_FEE",
      amount: -saleFee(airFryerGross),
      status: "PENDING",
      description: `Platform fee on ${airFryerNumber}`,
      reference: airFryerNumber,
      idempotencyKey: `fee:sale:${item6.id}`,
      createdAt: airFryerSoldAt,
    },
  ]);

  /*
   * The cancelled rental's two rows, in their own insert so their ids are known
   * rather than guessed at by position — the refund below names them in its
   * idempotency key, exactly as `recordEarningReversal` would have, so running a
   * reversal against this rental again is a constraint violation rather than a
   * second credit to Maya.
   *
   * Both are `REVERSED`, so they contribute to nothing at all. The refund carries the
   * whole story by itself; this is what "the ledger is append-only" means in practice.
   */
  const reversedIds = (
    await db
      .insert(walletTransactions)
      .values([
        {
          sellerId: maya,
          orderId: Number(order7.id),
          orderItemId: Number(item7.id),
          rentalId: Number(rental3.id),
          type: "RENTAL",
          amount: chair2Gross,
          status: "REVERSED",
          description: `Rental of ${seedProducts[11].title} · ${chair2Days} days`,
          reference: order7Number,
          idempotencyKey: `rental:${rental3.id}`,
          createdAt: chair2Start,
        },
        {
          sellerId: maya,
          orderId: Number(order7.id),
          orderItemId: Number(item7.id),
          rentalId: Number(rental3.id),
          type: "PLATFORM_FEE",
          amount: -rentalFee(chair2Gross),
          status: "REVERSED",
          description: `Platform fee on ${order7Number}`,
          reference: order7Number,
          idempotencyKey: `fee:rental:${rental3.id}`,
          createdAt: chair2Start,
        },
      ])
      .$returningId()
  ).map((row) => Number(row.id));

  // The refund, written at the state its originals held when they were reversed —
  // `AVAILABLE`, because the nine days since delivery are well past the settlement
  // delay. Had they still been settling, the refund would be `REVERSED` too: a refund
  // for money that was never withdrawable must not become withdrawable itself.
  await db.insert(walletTransactions).values({
    sellerId: maya,
    orderId: Number(order7.id),
    orderItemId: Number(item7.id),
    rentalId: Number(rental3.id),
    type: "REFUND",
    amount: -(chair2Gross - rentalFee(chair2Gross)),
    status: "AVAILABLE",
    description: `Refund · rental cancelled after return (${order7Number})`,
    reference: order7Number,
    idempotencyKey: `refund:${reversedIds.sort((a, b) => a - b).join(",")}`,
    createdAt: daysFromNow(-9),
  });

  // Maya's two payouts: one settled, one awaiting an admin. The pending one is the
  // reason the "Reserved" card is non-zero on a fresh seed, and it is the state a
  // seller spends the most time staring at, so it is the one worth having.
  const payoutDoneNumber = createPayoutNumber();
  const payoutOpenNumber = createPayoutNumber();
  const [payoutDone, payoutOpen] = await db
    .insert(payouts)
    .values([
      {
        sellerId: maya,
        payoutNumber: payoutDoneNumber,
        amount: paise(1000),
        status: "COMPLETED",
        methodId: Number(mayaBank.id),
        methodLabel: "HDFC Bank •••• 4321",
        note: "Diwali stock",
        idempotencyKey: "seed-maya-payout-completed",
        requestedAt: daysFromNow(-18),
        processingAt: daysFromNow(-17),
        completedAt: daysFromNow(-17),
      },
      {
        sellerId: maya,
        payoutNumber: payoutOpenNumber,
        amount: paise(500),
        status: "PENDING",
        methodId: Number(mayaBank.id),
        methodLabel: "HDFC Bank •••• 4321",
        note: null,
        idempotencyKey: "seed-maya-payout-pending",
        requestedAt: daysFromNow(-2),
      },
    ])
    .$returningId();

  await db.insert(walletTransactions).values([
    {
      sellerId: maya,
      payoutId: Number(payoutDone.id),
      type: "PAYOUT",
      amount: -paise(1000),
      status: "COMPLETED",
      description: `Payout ${payoutDoneNumber} sent`,
      reference: payoutDoneNumber,
      idempotencyKey: `payout-ledger:${payoutDone.id}`,
      createdAt: daysFromNow(-17),
    },
    {
      sellerId: maya,
      payoutId: Number(payoutOpen.id),
      type: "PAYOUT",
      amount: -paise(500),
      status: "PENDING",
      description: `Payout ${payoutOpenNumber} requested`,
      reference: payoutOpenNumber,
      idempotencyKey: `payout-ledger:${payoutOpen.id}`,
      createdAt: daysFromNow(-2),
    },
  ]);

  /*
   * Daniel: one completed rental, and a payout that came **back**.
   *
   * A `FAILED` payout is the case a wallet most easily gets wrong, so it is seeded
   * deliberately. The reservation is released by the `PAYOUT` row leaving
   * `PENDING`/`PROCESSING` — it is `FAILED` now, so it reserves nothing — and the
   * `PAYOUT_REVERSAL` row is the visible memo that says why. It is stored as a
   * positive amount and is counted for nothing; if the balance read it, Daniel would
   * be handed the same ₹2,000 twice.
   */
  const danielFailedNumber = createPayoutNumber();
  const danielSendingNumber = createPayoutNumber();
  const [danielPayout, danielSending] = await db
    .insert(payouts)
    .values([
      {
        sellerId: daniel,
        payoutNumber: danielFailedNumber,
        amount: paise(2000),
        status: "FAILED",
        methodId: Number(danielUpi.id),
        methodLabel: "danielk@okaxis",
        note: "Shoot expenses",
        failureReason: "The UPI handle could not be verified within 24 hours.",
        idempotencyKey: "seed-daniel-payout-failed",
        requestedAt: daysFromNow(-10),
        processingAt: daysFromNow(-9),
        completedAt: null,
      },
      // The one state a seller cannot move on their own and cannot be talked out of:
      // an admin has said "sending", and until they confirm otherwise it is still
      // reserved. Seeded so the admin queue has a row in every live state.
      {
        sellerId: daniel,
        payoutNumber: danielSendingNumber,
        amount: paise(1000),
        status: "PROCESSING",
        methodId: Number(danielBank.id),
        methodLabel: "ICICI Bank •••• 7719",
        note: null,
        idempotencyKey: "seed-daniel-payout-processing",
        requestedAt: daysFromNow(-3),
        processingAt: daysFromNow(-1),
        completedAt: null,
      },
    ])
    .$returningId();

  await db.insert(walletTransactions).values([
    {
      sellerId: daniel,
      orderId: Number(order5.id),
      orderItemId: Number(item5.id),
      rentalId: Number(rental2.id),
      type: "RENTAL",
      amount: pastSubtotal,
      status: "AVAILABLE",
      description: `Rental of ${seedProducts[1].title} · ${pastDays} days`,
      reference: order5Number,
      idempotencyKey: `rental:${rental2.id}`,
      createdAt: pastStart,
    },
    {
      sellerId: daniel,
      orderId: Number(order5.id),
      orderItemId: Number(item5.id),
      rentalId: Number(rental2.id),
      type: "PLATFORM_FEE",
      amount: -rentalFee(pastSubtotal),
      status: "AVAILABLE",
      description: `Platform fee on ${order5Number}`,
      reference: order5Number,
      idempotencyKey: `fee:rental:${rental2.id}`,
      createdAt: pastStart,
    },
    {
      sellerId: daniel,
      payoutId: Number(danielPayout.id),
      type: "PAYOUT",
      amount: -paise(2000),
      status: "FAILED",
      description: `Payout ${danielFailedNumber} requested`,
      reference: danielFailedNumber,
      idempotencyKey: `payout-ledger:${danielPayout.id}`,
      createdAt: daysFromNow(-10),
    },
    {
      sellerId: daniel,
      payoutId: Number(danielPayout.id),
      type: "PAYOUT_REVERSAL",
      amount: paise(2000),
      status: "COMPLETED",
      description: `Payout ${danielFailedNumber} did not complete — released back to your balance`,
      reference: danielFailedNumber,
      idempotencyKey: `payout-reversal:${danielPayout.id}:FAILED`,
      createdAt: daysFromNow(-9),
    },
    {
      sellerId: daniel,
      payoutId: Number(danielSending.id),
      type: "PAYOUT",
      amount: -paise(1000),
      status: "PROCESSING",
      description: `Payout ${danielSendingNumber} requested`,
      reference: danielSendingNumber,
      idempotencyKey: `payout-ledger:${danielSending.id}`,
      createdAt: daysFromNow(-3),
    },
  ]);

  console.log("\nSeed complete!");
  // Echoed so a fresh clone knows what to sign in with. These are the *seeded*
  // credentials, read from the environment — see `lib/config` — and printing them
  // here is the whole point: they only work against a local demo database.
  console.log(`  Admin:  ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}`);
  console.log(`  Seller: seller@revaro.local / ${DEV_PASSWORD}`);
  console.log(`  Buyer:  buyer@revaro.local / ${DEV_PASSWORD}`);
  console.log(
    `  Also:   daniel@revaro.local, priya@revaro.local, sara@revaro.local / ${DEV_PASSWORD}`,
  );
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
