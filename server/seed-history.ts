/**
 * History seeder — the volume dataset.
 *
 * `server/seed.ts` builds the *demo* world: a handful of named accounts and the
 * orders the README walks you through. This script builds the *marketplace* on
 * top of it — hundreds of buyers, sellers, orders, rentals, reviews,
 * conversations and notifications spread over the last twelve months — which is
 * what pagination, search, sorting, seller isolation and seller dashboards can
 * actually be tested against.
 *
 * Additive by design: it never truncates and never touches the demo rows, so it
 * can be re-run after editing it. Re-running *adds* another volume block rather
 * than replacing the previous one; to start over, run `pnpm db:seed` (which
 * truncates) followed by this script.
 *
 *   pnpm db:migrate && pnpm db:seed && pnpm db:seed:products   # required first
 *   pnpm db:seed:history
 *   HISTORY_SCALE=0.2 pnpm db:seed:history    # a smaller pass while iterating
 *
 * Every value is generated from a fixed RNG seed, so two runs on an empty
 * database produce the same marketplace. Dates are spread across twelve months
 * and weighted towards recent days, because a dataset where every row is
 * "today" cannot tell a sort order apart from an accident.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { db, pool } from "./db";
import {
  addresses,
  cartItems,
  carts,
  categories,
  conversationParticipants,
  conversations,
  favorites,
  messages,
  notifications,
  orderItems,
  orders,
  products,
  rentals,
  rentalEvents,
  reviews,
  reviewHelpfulVotes,
  sellerProfiles,
  transactions,
  users,
} from "./schema";
import { createOrderNumber } from "./lib/payments/order-number";
import { effectiveDailyRate, rentalDays } from "../src/lib/pricing";
import { refreshProductRatings } from "./lib/rating-aggregate";

/* --------------------------------- config ---------------------------------- */

const SCALE = Number(process.env.HISTORY_SCALE ?? 1);
const RNG_SEED = Number(process.env.HISTORY_SEED ?? 20261002);
const PASSWORD = process.env.HISTORY_PASSWORD ?? "revaro-dev-2026";

const TARGETS = {
  buyers: Math.round(60 * SCALE),
  sellers: Math.round(28 * SCALE),
  orders: Math.round(340 * SCALE),
  rentals: Math.round(150 * SCALE),
  reviews: Math.round(200 * SCALE),
  favorites: Math.round(300 * SCALE),
  carts: Math.round(120 * SCALE),
  conversations: Math.round(70 * SCALE),
  notifications: Math.round(220 * SCALE),
} as const;

/**
 * Rentals as a share of orders, and how often an order carries more than one
 * line.
 *
 * Both are what make the *derived* counts land: order items and rental rows are
 * consequences of the order mix, not separate targets. Roughly half the orders
 * are rentals (rental-heavy categories like cameras and appliances dominate the
 * catalogue), and about half carry a second or third line, which is also where
 * multi-seller orders come from.
 */
const RENTAL_SHARE = 0.5;
const MULTI_LINE_CHANCE = 0.5;

const HISTORY_DAYS = 365;
const BATCH = 200;

/* --------------------------------- helpers --------------------------------- */

/** Deterministic RNG, so the same seed produces the same marketplace. */
function mulberry32(seed: number) {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(RNG_SEED);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const chance = (probability: number) => rand() < probability;
/** Fisher–Yates with the seeded RNG, so a sample is random but reproducible. */
function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (days: number, hour = 12) => {
  const date = new Date(now - days * DAY);
  date.setHours(hour, randInt(0, 59), 0, 0);
  return date;
};
/** A date-only value, the way the rental columns store one. */
const dateOnly = (days: number) => new Date(daysAgo(days));

/** A day count weighted towards recent activity, spread over the whole year. */
function recentDay(): number {
  const skewed = rand() ** 2.2;
  return Math.round(skewed * HISTORY_DAYS);
}

/** Insert in chunks: one giant multi-row INSERT is where packets get dropped. */
async function insertInChunks<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    await insert(rows.slice(i, i + BATCH));
  }
}

/* --------------------------------- vocabularies ------------------------------ */

const FIRST_NAMES = [
  "Aarav", "Diya", "Vivaan", "Ananya", "Aditya", "Ishita", "Arjun", "Meera", "Kabir", "Riya",
  "Rohan", "Sneha", "Karthik", "Pooja", "Nikhil", "Tanvi", "Siddharth", "Neha", "Varun", "Kavya",
  "Manish", "Shreya", "Harsh", "Nandini", "Farhan", "Aditi", "Gaurav", "Priya", "Devansh", "Ira",
  "Yash", "Simran", "Aryan", "Megha", "Naveen", "Divya", "Sameer", "Ritika", "Ashwin", "Lakshmi",
  "Jatin", "Sanjana", "Tejas", "Aisha", "Manoj", "Bhavana", "Rakesh", "Sunita", "Vivek", "Anjali",
] as const;

const LAST_NAMES = [
  "Sharma", "Verma", "Iyer", "Nair", "Reddy", "Patel", "Mehta", "Kapoor", "Bose", "Chatterjee",
  "Desai", "Gupta", "Joshi", "Kulkarni", "Malhotra", "Nair", "Pandey", "Rao", "Sethi", "Trivedi",
] as const;

const LOCALITIES = [
  { locality: "Koramangala", city: "Bengaluru", state: "Karnataka", pin: "560034" },
  { locality: "Indiranagar", city: "Bengaluru", state: "Karnataka", pin: "560038" },
  { locality: "Jayanagar", city: "Bengaluru", state: "Karnataka", pin: "560041" },
  { locality: "HSR Layout", city: "Bengaluru", state: "Karnataka", pin: "560102" },
  { locality: "Bandra West", city: "Mumbai", state: "Maharashtra", pin: "400050" },
  { locality: "Powai", city: "Mumbai", state: "Maharashtra", pin: "400076" },
  { locality: "Andheri East", city: "Mumbai", state: "Maharashtra", pin: "400069" },
  { locality: "Hinjewadi", city: "Pune", state: "Maharashtra", pin: "411057" },
  { locality: "Salt Lake Sector V", city: "Kolkata", state: "West Bengal", pin: "700091" },
  { locality: "Banjara Hills", city: "Hyderabad", state: "Telangana", pin: "500034" },
  { locality: "Vasant Vihar", city: "Delhi", state: "Delhi", pin: "110057" },
  { locality: "MG Road", city: "Bengaluru", state: "Karnataka", pin: "560001" },
] as const;

const SELLER_BIOS = [
  "Verified seller. Every item inspected, cleaned and tested before it is listed.",
  "Family-run business renting out gear we only use on weekends.",
  "Studio equipment, cameras and lighting — collected and delivered across the city.",
  "Pre-loved electronics with a 7-day replacement promise.",
  "Furniture and homeware cleared out of two house moves.",
  "Camping and outdoor kit, kept dry and ready for the next trip.",
  "Tools and workshop equipment for weekend DIY.",
  "Bicycles, fitness gear and sports equipment, serviced every month.",
] as const;

/* -------------------------- order lifecycle mapping ------------------------- */

/**
 * What an order's status can plausibly be, given how old it is.
 *
 * A month-old order cannot still be `READY_FOR_PICKUP`, and nothing should be
 * `CANCELLED` from six months ago. Generating a status independently of the date
 * is what produces a demo dataset that quietly contradicts the lifecycle module
 * in `server/lib/order-fulfillment.ts`.
 */
const PURCHASE_STATUS_BY_AGE: { maxAgeDays: number; statuses: readonly string[] }[] = [
  { maxAgeDays: 3, statuses: ["CONFIRMED", "PROCESSING", "READY_FOR_PICKUP"] },
  { maxAgeDays: 10, statuses: ["PROCESSING", "READY_FOR_PICKUP", "SHIPPED", "CANCELLED"] },
  { maxAgeDays: 21, statuses: ["SHIPPED", "DELIVERED", "CANCELLED"] },
  { maxAgeDays: 45, statuses: ["DELIVERED", "COMPLETED", "CANCELLED"] },
  { maxAgeDays: HISTORY_DAYS, statuses: ["COMPLETED", "DELIVERED"] },
];

/** The per-line fulfillment that goes with an order status. */
const FULFILLMENT_BY_STATUS: Record<string, string | null> = {
  CONFIRMED: "PROCESSING",
  PROCESSING: "READY_FOR_PICKUP",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

function statusForAge(ageDays: number): string {
  const band = PURCHASE_STATUS_BY_AGE.find((entry) => ageDays <= entry.maxAgeDays) ??
    PURCHASE_STATUS_BY_AGE[PURCHASE_STATUS_BY_AGE.length - 1]!;
  return pick(band.statuses);
}

/* ---------------------------------- types ---------------------------------- */

type ProductRow = typeof products.$inferSelect;
type AddressRow = typeof addresses.$inferSelect;

/** What the history seeder actually needs from a product. */
type CatalogueProduct = Pick<
  ProductRow,
  | "id"
  | "title"
  | "sellerId"
  | "listingType"
  | "purchasePrice"
  | "rentalPricePerDay"
  | "rentalPricePerWeek"
  | "rentalPricePerMonth"
  | "securityDeposit"
> & { imageUrl: string | null };

/* ----------------------------------- main ----------------------------------- */

async function main() {
  console.log("Revaro history seeder");
  console.log(`  scale=${SCALE} rng=${RNG_SEED}`);
  console.log(
    `  targets: ${TARGETS.buyers} buyers, ${TARGETS.sellers} sellers, ${TARGETS.orders} orders, ` +
      `${TARGETS.rentals} rentals, ${TARGETS.reviews} reviews`,
  );

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  /* ------------------------------- catalogue -------------------------------- */

  console.log("Reading catalogue...");
  const existingCategories = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories);
  const categoryIds = existingCategories.map((row) => row.id);
  if (categoryIds.length === 0) throw new Error("No categories — run `pnpm db:seed` first.");

  const catalogue = (await db
    .select({
      id: products.id,
      title: products.title,
      sellerId: products.sellerId,
      listingType: products.listingType,
      purchasePrice: products.purchasePrice,
      rentalPricePerDay: products.rentalPricePerDay,
      rentalPricePerWeek: products.rentalPricePerWeek,
      rentalPricePerMonth: products.rentalPricePerMonth,
      securityDeposit: products.securityDeposit,
      // One representative image per product, so receipts and order cards have
      // something to show without a second round trip.
      imageUrl: sql<string | null>`(
        SELECT pi.url FROM product_images pi
        WHERE pi.product_id = ${products.id}
        ORDER BY pi.sort_order LIMIT 1
      )`,
    })
    .from(products)
    .where(and(ne(products.status, "ARCHIVED"), inArray(products.categoryId, categoryIds)))
    .limit(8000)) as unknown as CatalogueProduct[];
  if (catalogue.length < 100) {
    throw new Error(`Only ${catalogue.length} listed products — run \`pnpm db:seed:products\` first.`);
  }
  const forSale = catalogue.filter((p) => p.purchasePrice !== null);
  const forRent = catalogue.filter((p) => p.rentalPricePerDay !== null);
  console.log(`  catalogue: ${catalogue.length} listed (${forSale.length} buyable, ${forRent.length} rentable)`);

  /* --------------------------------- people --------------------------------- */

  console.log("Seeding accounts...");
  const existingSellers = (await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "SELLER"))) as unknown as { id: number }[];
  const existingBuyers = (await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "USER"))) as unknown as { id: number }[];

  const makeName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  // Emails are derived from a counter, not from the name: two "Aarav Sharma"s must
  // not collide, and the column is unique.
  let emailCounter = existingSellers.length + existingBuyers.length;
  const nextEmail = (kind: string) => {
    emailCounter += 1;
    return `history.${kind}${emailCounter}@revaro.local`;
  };

  const newSellerRows = Array.from({ length: TARGETS.sellers }, (_, index) => ({
    name: makeName(),
    email: nextEmail("seller"),
    passwordHash,
    role: "SELLER" as const,
    verified: chance(0.8),
    createdAt: daysAgo(randInt(200, HISTORY_DAYS)),
    // Every profile row needs a distinct key, so use the loop index as a
    // discriminator in the bio rather than repeating it verbatim.
    bio: `${pick(SELLER_BIOS)} (#${index + 1})`,
  }));
  const newBuyerRows = Array.from({ length: TARGETS.buyers }, () => ({
    name: makeName(),
    email: nextEmail("buyer"),
    passwordHash,
    role: "USER" as const,
    verified: chance(0.75),
    createdAt: daysAgo(randInt(20, HISTORY_DAYS)),
  }));

  const insertedSellers = (await db.insert(users).values(newSellerRows).$returningId()) as unknown as {
    id: number;
  }[];
  const insertedBuyers = (await db.insert(users).values(newBuyerRows).$returningId()) as unknown as {
    id: number;
  }[];

  const sellerIds = [...existingSellers.map((s) => s.id), ...insertedSellers.map((u) => u.id)];
  const buyerIds = [...existingBuyers.map((b) => b.id), ...insertedBuyers.map((u) => u.id)];
  if (sellerIds.length === 0 || buyerIds.length === 0) throw new Error("No accounts to trade with.");

  await insertInChunks(
    insertedSellers.map((row, index) => ({
      userId: Number(row.id),
      bio: newSellerRows[index]?.bio ?? null,
      location: `${pick(LOCALITIES).city}, ${pick(LOCALITIES).state}`,
      responseRateHours: randInt(1, 24),
      verified: chance(0.8),
      createdAt: daysAgo(randInt(200, HISTORY_DAYS)),
    })),
    (batch) => db.insert(sellerProfiles).values(batch),
  );
  console.log(`  sellers: ${sellerIds.length}, buyers: ${buyerIds.length}`);

  /* -------------------------------- addresses ------------------------------- */

  console.log("Seeding addresses...");
  const addressRows = buyerIds.flatMap((userId) =>
    Array.from({ length: randInt(1, 2) }, (_, index) => {
      const place = pick(LOCALITIES);
      return {
        userId,
        name: makeName(),
        phone: `+91 ${randInt(70, 99)}${randInt(10000000, 99999999)}`,
        addressLine1: `${randInt(1, 240)}, ${place.locality}`,
        addressLine2: chance(0.4) ? `Flat ${randInt(101, 1404)}, ${pick(["A", "B", "C", "D"])} block` : null,
        city: place.city,
        state: place.state,
        postalCode: place.pin,
        country: "India",
        isDefault: index === 0,
        createdAt: daysAgo(randInt(60, HISTORY_DAYS)),
      };
    }),
  );
  await insertInChunks(addressRows, (batch) => db.insert(addresses).values(batch));
  const addressRowsInDb = (await db.select().from(addresses)) as unknown as AddressRow[];
  const addressesByUser = new Map<number, AddressRow[]>();
  for (const row of addressRowsInDb) {
    const list = addressesByUser.get(row.userId) ?? [];
    list.push(row);
    addressesByUser.set(row.userId, list);
  }
  console.log(`  addresses: ${addressRowsInDb.length}`);

  /** The snapshot shape `server/lib/address-snapshot.ts` parses. */
  const snapshotOf = (address: AddressRow) =>
    JSON.stringify({
      name: address.name,
      phone: address.phone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    });

  /* --------------------------------- orders --------------------------------- */

  console.log("Seeding orders and order items...");
  const orderNumbers = new Set<string>();
  const uniqueOrderNumber = () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = createOrderNumber();
      if (!orderNumbers.has(candidate)) {
        orderNumbers.add(candidate);
        return candidate;
      }
    }
    throw new Error("Could not find a free order number — the RNG is looping.");
  };

  const trackingNumber = (ageDays: number) =>
    `RVX${String(9_800_000 + randInt(0, 999_999))}${Math.max(0, HISTORY_DAYS - ageDays)}IN`;

  /**
 * Pick a product this order has not used, preferring a seller it has not used
 * either. Falls back to any unused product once every seller is taken, so the
 * line count is never short just because one seller dominates the catalogue.
 */
function pickProductFromUnusedSeller(
  pool: readonly CatalogueProduct[],
  usedProducts: Set<number>,
  usedSellers: Set<number>,
): CatalogueProduct | null {
  const fresh = pool.filter(
    (product) => !usedProducts.has(product.id) && !usedSellers.has(product.sellerId),
  );
  if (fresh.length > 0) return pick(fresh);
  const unused = pool.filter((product) => !usedProducts.has(product.id));
  return unused.length > 0 ? pick(unused) : null;
}

type PlannedLine = { product: CatalogueProduct; mode: "BUY" | "RENT"; quantity: number };

  const orderRows: (typeof orders.$inferInsert)[] = [];
  const linePlans: { orderIndex: number; line: PlannedLine }[] = [];

  for (let i = 0; i < TARGETS.orders; i += 1) {
    const ageDays = recentDay();
    const buyerId = pick(buyerIds);
    // Rentals are a minority of real marketplaces; roughly half here.
    const wantsRental = chance(RENTAL_SHARE);
    const status = statusForAge(ageDays);
    // A cancelled order never became a rental and never reached fulfilment.
    const cancelled = status === "CANCELLED";
    const mode: "BUY" | "RENT" = wantsRental && !cancelled ? "RENT" : "BUY";

    const pool = mode === "RENT" ? forRent : forSale;
    if (pool.length === 0) continue;

    const lineCount = chance(MULTI_LINE_CHANCE) ? randInt(2, 3) : 1;
    const lines: PlannedLine[] = [];
    const usedProducts = new Set<number>();
    // Distinct sellers within one order is what makes it a genuinely multi-seller
    // order — the case per-line fulfillment exists for. Re-picking until the
    // seller is new makes that the normal shape rather than a rare accident.
    const usedSellers = new Set<number>();
    for (let n = 0; n < lineCount; n += 1) {
      const product = pickProductFromUnusedSeller(pool, usedProducts, usedSellers);
      if (!product) continue;
      usedProducts.add(product.id);
      usedSellers.add(product.sellerId);
      lines.push({ product, mode, quantity: chance(0.12) ? randInt(2, 3) : 1 });
    }
    if (lines.length === 0) continue;

    let subtotal = 0;
    let depositTotal = 0;
    for (const line of lines) {
      if (line.mode === "BUY") {
        subtotal += (line.product.purchasePrice ?? 0) * line.quantity;
      } else {
        const days = rentalDays({
          startDate: dateOnly(ageDays),
          endDate: dateOnly(ageDays - randInt(3, 10)),
        });
        const rate = effectiveDailyRate(
          {
            rentalPricePerDay: line.product.rentalPricePerDay ?? 0,
            rentalPricePerWeek: line.product.rentalPricePerWeek ?? null,
            rentalPricePerMonth: line.product.rentalPricePerMonth ?? null,
            securityDeposit: line.product.securityDeposit ?? 0,
          },
          days,
        );
        subtotal += rate * days * line.quantity;
        depositTotal += (line.product.securityDeposit ?? 0) * line.quantity;
      }
    }

    const deliveryMethod = mode === "RENT" ? pick(["PICKUP", "DELIVERY"] as const) : "DELIVERY";
    const deliveryFee = mode === "RENT" && deliveryMethod === "PICKUP" ? 0 : randInt(39, 99);
    const address = pick(addressesByUser.get(buyerId) ?? []);
    const createdAt = daysAgo(ageDays);
    const delivered = ["SHIPPED", "DELIVERED", "COMPLETED"].includes(status);

    orderRows.push({
      orderNumber: uniqueOrderNumber(),
      userId: buyerId,
      // One mode per order, decided once above — an order is a purchase or a
      // rental, not a mixture of the two, so `MIXED` is left to the app's
      // rent-to-own path rather than invented here.
      orderType: mode === "RENT" ? "RENTAL" : "PURCHASE",
      status,
      // Money and fulfillment are separate lifecycles: a cancelled order was
      // paid and then refunded, which is exactly the distinction the schema
      // comment insists on.
      paymentStatus: cancelled ? "REFUNDED" : "PAID",
      subtotal,
      deliveryFee,
      depositTotal,
      discount: 0,
      tax: 0,
      total: subtotal + depositTotal + deliveryFee,
      currency: "INR",
      deliveryMethod,
      deliveryAddressId: address?.id ?? null,
      deliveryAddressSnapshot: address ? snapshotOf(address) : null,
      trackingNumber: delivered && deliveryMethod === "DELIVERY" ? trackingNumber(ageDays) : null,
      paymentProvider: "mock",
      paymentReference: `mock_hist_${100_000 + i}`,
      createdAt,
      // "Recently updated" is a real ordering, so the timestamp has to move for
      // orders that progressed after they were placed.
      updatedAt: daysAgo(Math.max(0, ageDays - randInt(0, 6))),
    });
    lines.forEach((line) => linePlans.push({ orderIndex: orderRows.length - 1, line }));
  }

  await insertInChunks(orderRows, (batch) => db.insert(orders).values(batch));
  const insertedOrders = (await db
    .select({ id: orders.id, status: orders.status, orderType: orders.orderType, userId: orders.userId })
    .from(orders)) as unknown as { id: number; status: string; orderType: string; userId: number }[];
  console.log(`  orders: ${insertedOrders.length}`);

  // Order rows are inserted in one order, so the newest id is the last row that
  // was planned; map by position and fall back safely if the table already had
  // rows from the demo seed.
  const plannedOrderIds = insertedOrders.slice(-orderRows.length);
  const orderByPlanIndex = new Map<number, number>();
  linePlans.forEach(({ orderIndex }) => {
    const planned = plannedOrderIds[orderIndex];
    if (planned) orderByPlanIndex.set(orderIndex, planned.id);
  });

  console.log("Seeding order items...");
  const itemRows: (typeof orderItems.$inferInsert)[] = [];

  // Rentals are planned per order so their dates are consistent across lines.
  const rentalWindowByOrder = new Map<number, { start: Date; end: Date; days: number }>();
  for (const { orderIndex, line } of linePlans) {
    const orderId = orderByPlanIndex.get(orderIndex);
    const order = plannedOrderIds[orderIndex];
    if (!orderId || !order) continue;
    const ageDays = Math.max(
      0,
      Math.round((now - new Date(orderRows[orderIndex]!.createdAt!).getTime()) / DAY),
    );

    if (line.mode === "BUY") {
      itemRows.push({
        orderId,
        productId: line.product.id,
        sellerId: line.product.sellerId,
        mode: "BUY",
        fulfillmentStatus: FULFILLMENT_BY_STATUS[order.status] ?? null,
        quantity: line.quantity,
        unitPrice: line.product.purchasePrice ?? 0,
        rentalCharge: 0,
        securityDeposit: 0,
        lineTotal: (line.product.purchasePrice ?? 0) * line.quantity,
        titleSnapshot: line.product.title,
        imageSnapshot: line.product.imageUrl ?? null,
        createdAt: orderRows[orderIndex]!.createdAt!,
      });
      continue;
    }

    let window = rentalWindowByOrder.get(orderId);
    if (!window) {
      const start = dateOnly(ageDays);
      const end = dateOnly(Math.max(0, ageDays - randInt(3, 10)));
      window = { start, end, days: rentalDays({ startDate: start, endDate: end }) };
      rentalWindowByOrder.set(orderId, window);
    }
    const rate = effectiveDailyRate(
      {
        rentalPricePerDay: line.product.rentalPricePerDay ?? 0,
        rentalPricePerWeek: line.product.rentalPricePerWeek ?? null,
        rentalPricePerMonth: line.product.rentalPricePerMonth ?? null,
        securityDeposit: line.product.securityDeposit ?? 0,
      },
      window.days,
    );
    itemRows.push({
      orderId,
      productId: line.product.id,
      sellerId: line.product.sellerId,
      mode: "RENT",
      fulfillmentStatus: FULFILLMENT_BY_STATUS[order.status] ?? null,
      quantity: line.quantity,
      unitPrice: rate,
      rentalCharge: rate * window.days * line.quantity,
      securityDeposit: (line.product.securityDeposit ?? 0) * line.quantity,
      lineTotal: rate * window.days * line.quantity + (line.product.securityDeposit ?? 0) * line.quantity,
      titleSnapshot: line.product.title,
      imageSnapshot: line.product.imageUrl ?? null,
      startDate: window.start,
      endDate: window.end,
      rentalDays: window.days,
      createdAt: orderRows[orderIndex]!.createdAt!,
    });
  }

  const insertedItems = (await db
    .insert(orderItems)
    .values(itemRows)
    .$returningId()) as unknown as { id: number }[];
  console.log(`  order items: ${insertedItems.length}`);

  /* --------------------------------- rentals -------------------------------- */

  console.log("Seeding rentals...");
  const rentalRows: (typeof rentals.$inferInsert)[] = [];
  const rentalMeta: { start: Date; end: Date; status: string }[] = [];
  /** Parallel to `rentalRows`: the line each rental was created from. */
  const rentalOrderItemIds: number[] = [];

  // Line order is preserved by the insert above, so a rental is recovered from
  // its item by position rather than by a lookup that would be O(n²).
  insertedItems.forEach((item, index) => {
    if (rentalRows.length >= TARGETS.rentals) return;
    const line = itemRows[index];
    if (!line || line.mode !== "RENT" || !line.startDate || !line.endDate) return;
    const order = insertedOrders.find((candidate) => candidate.id === line.orderId);
    if (!order) return;

    const start = new Date(line.startDate);
    const end = new Date(line.endDate);
    const daysIn = Math.round((now - start.getTime()) / DAY);
    const daysLeft = Math.round((end.getTime() - now) / DAY);

    // The status follows the dates, because `rental-lifecycle.ts` derives the
    // customer's tabs from them — a rental stored as ACTIVE whose window closed
    // three weeks ago is a state the UI cannot reconcile.
    let status: string;
    if (order.status === "CANCELLED") status = "CANCELLED";
    else if (daysIn < 0) status = "CONFIRMED";
    else if (daysLeft < 0) status = chance(0.15) ? "OVERDUE" : "COMPLETED";
    else if (daysLeft <= 1) status = "RETURN_PENDING";
    else status = "ACTIVE";

    const returned = status === "COMPLETED";
    rentalRows.push({
      orderId: order.id,
      orderItemId: Number(item.id),
      productId: line.productId,
      renterId: order.userId,
      ownerId: line.sellerId,
      startDate: start,
      endDate: end,
      actualReturnDate: returned ? new Date(end.getTime() + randInt(0, 2) * DAY) : null,
      dailyRate: line.unitPrice,
      rentalSubtotal: line.rentalCharge ?? 0,
      securityDeposit: line.securityDeposit ?? 0,
      deliveryFee: 0,
      total: (line.rentalCharge ?? 0) + (line.securityDeposit ?? 0),
      status,
      returnRequestedAt: status === "COMPLETED" ? new Date(end.getTime() - DAY) : null,
      completedAt: returned ? new Date(end.getTime() + randInt(0, 2) * DAY) : null,
      createdAt: start,
    });
    rentalMeta.push({ start, end, status });
    rentalOrderItemIds.push(Number(item.id));
  });

  const insertedRentals = (await db
    .insert(rentals)
    .values(rentalRows)
    .$returningId()) as unknown as { id: number }[];
  const rentalIdByOrderItem = new Map<number, number>();
  insertedRentals.forEach((rental, index) => {
    const orderItemId = rentalOrderItemIds[index];
    if (orderItemId !== undefined) rentalIdByOrderItem.set(orderItemId, Number(rental.id));
  });
  console.log(`  rentals: ${insertedRentals.length}`);

  console.log("Seeding rental events...");
  // The timeline is a sequence of things that happened, so events are derived
  // from the same dates as the rental rather than invented.
  const eventRows: (typeof rentalEvents.$inferInsert)[] = [];
  insertedRentals.forEach((rental, index) => {
    const meta = rentalMeta[index];
    if (!meta) return;
    const add = (type: string, at: Date) =>
      eventRows.push({ rentalId: Number(rental.id), type, createdAt: at });
    add("CONFIRMED", new Date(meta.start.getTime() - 3 * DAY));
    if (meta.status === "CANCELLED") {
      add("CANCELLED", new Date(meta.start.getTime() - DAY));
      return;
    }
    if (meta.status !== "CONFIRMED") {
      add("DELIVERY_COMPLETED", new Date(meta.start.getTime() - 6 * 60 * 60 * 1000));
      add("STARTED", meta.start);
    }
    if (meta.status === "COMPLETED") {
      add("RETURN_REQUESTED", new Date(meta.end.getTime() - DAY));
      add("RETURNED", meta.end);
      add("COMPLETED", new Date(meta.end.getTime() + DAY));
    }
  });
  await insertInChunks(eventRows, (batch) => db.insert(rentalEvents).values(batch));

  /* ------------------------------ transactions ------------------------------ */

  console.log("Seeding payment transactions...");
  const transactionRows = orderRows.map((row, index) => ({
    userId: row.userId!,
    orderId: plannedOrderIds[index]?.id ?? null,
    type: row.status === "CANCELLED" ? "REFUND" : "PAYMENT",
    amount: row.total!,
    status: "SUCCEEDED",
    provider: "mock",
    providerTransactionId: row.paymentReference!,
    createdAt: row.createdAt!,
  }));
  await insertInChunks(transactionRows, (batch) => db.insert(transactions).values(batch));

  /* --------------------------------- reviews -------------------------------- */

  console.log("Seeding reviews...");
  // A review must be about something the reviewer actually bought or rented, so
  // the candidates are real lines of delivered/completed orders — never an
  // arbitrary product. Linking a random product would make the review's seller
  // disagree with the order it claims to come from.
  const REVIEW_COMMENTS = [
    "Item was clean, well packed and arrived a day early. Would buy from this seller again.",
    "Exactly as described and the seller answered every question patiently.",
    "Pickup was easy and the handover took five minutes. No complaints at all.",
    "Good condition for the price. Minor wear I had expected, nothing more.",
    "Delivery was on time and the item was better than the photos suggested.",
    "Smooth transaction from payment to handover. Highly recommended.",
  ];
  const REVIEW_TITLES = [
    "Exactly as described",
    "Great condition, quick delivery",
    "Smooth handover",
    "Worth the price",
    "Good communication",
  ];
  const SELLER_REPLIES = [
    "Thanks so much for the kind words — it is back on the shelf and ready for the next person.",
    "Appreciate you taking the time to write this. Do reach out if anything comes up.",
    "Glad it worked out. We service everything between hires, so it stays in good shape.",
    "Thank you! If you need it again, just message us and we will set it aside.",
  ];

  const reviewable = itemRows
    .map((line, index) => ({
      line,
      itemId: insertedItems[index] ? Number(insertedItems[index]!.id) : null,
      order: insertedOrders.find((candidate) => candidate.id === line.orderId),
    }))
    .filter(
      (
        entry,
      ): entry is {
        line: (typeof itemRows)[number];
        itemId: number;
        order: (typeof insertedOrders)[number];
      } => entry.itemId !== null && !!entry.order && ["DELIVERED", "COMPLETED"].includes(entry.order.status),
    );

  const reviewRows: (typeof reviews.$inferInsert)[] = [];
  for (const entry of shuffle(reviewable)) {
    if (reviewRows.length >= TARGETS.reviews) break;
    const { line, itemId, order } = entry;
    // Drawn before the row is pushed so `updatedAt` can differ from `createdAt`
    // without the two calls drifting — the edit must happen *after* the review.
    const reviewDate = daysAgo(randInt(3, 45));
    const edited = chance(0.2);
    // A seller answers roughly a quarter of what they receive — enough for the
    // reply to read as a real feature rather than an empty state, but not so much
    // that every review has one.
    const replied = chance(0.25);
    reviewRows.push({
      userId: order.userId,
      productId: line.productId,
      sellerId: line.sellerId,
      orderId: order.id,
      orderItemId: itemId,
      rentalId: rentalIdByOrderItem.get(itemId) ?? null,
      // The type follows the line: a line backed by a rental is a rental review.
      // Derived here for the same reason the API derives it — there is nothing to
      // ask the client, because there is no client writing history rows.
      purchaseType: rentalIdByOrderItem.has(itemId) || line.mode === "RENT" ? "RENTAL" : "PURCHASE",
      // The order line above *is* the proof, so this is true of every generated
      // row. A review that could not be traced to a delivered line would never
      // have been writable through `POST /reviews` at all.
      isVerifiedPurchase: true,
      // Counted up by the vote seeding below, not invented here — see the note
      // there. Left out of this insert entirely rather than set to 0, so it cannot
      // be half-maintained by accident.
      //
      // A small share of reviews are moderated, so the admin queue and the
      // "hidden" path have real rows behind them. Without one, nothing exercises
      // `refreshProductRating` *removing* a review from the average.
      status: chance(0.04) ? "HIDDEN" : "PUBLISHED",
      isEdited: edited,
      rating: chance(0.75) ? 5 : chance(0.7) ? 4 : 3,
      title: pick(REVIEW_TITLES),
      comment: pick(REVIEW_COMMENTS),
      // The seller's public reply. Stored with its own timestamp because the card
      // dates the reply separately from the review — a reply that arrives months
      // later is a normal thing, not an edit.
      sellerReply: replied ? pick(SELLER_REPLIES) : null,
      sellerRepliedAt: replied ? daysAgo(randInt(0, 20)) : null,
      // A review is written after delivery, never on the day of payment.
      createdAt: reviewDate,
    });
    // `updatedAt` only moves when `isEdited`, so the card's "Edited" badge is
    // backed by a real timestamp difference rather than a flag with nothing
    // behind it.
    if (edited) reviewRows[reviewRows.length - 1]!.updatedAt = reviewDate;
  }
  // `$returningId()` per chunk, because the "helpful" votes below have to point at
  // real review ids — a vote row that names a review this seed did not write would
  // be a foreign-key failure, and a vote row without a review has no meaning.
  const insertedReviewIds: { reviewId: number; authorId: number }[] = [];
  for (let i = 0; i < reviewRows.length; i += BATCH) {
    const batch = reviewRows.slice(i, i + BATCH);
    const returned = (await db.insert(reviews).values(batch).$returningId()) as unknown as {
      id: number;
    }[];
    returned.forEach((row, offset) => {
      insertedReviewIds.push({ reviewId: Number(row.id), authorId: batch[offset]!.userId });
    });
  }
  console.log(`  reviews: ${insertedReviewIds.length}`);

  // "Helpful" votes, then the counter is *derived from them* rather than invented.
  //
  // `reviews.helpful_count` is a denormalised cache of `review_helpful_votes`; the
  // API maintains both in one transaction. Seeding a random counter without the
  // votes behind it would leave the two permanently disagreeing — the button would
  // show a number that the "did this viewer already vote?" query cannot account
  // for, and no test could tell. So the votes go in first and the count is then
  // read back with a GROUP BY, which is the same aggregation the write path uses.
  const voteRows: (typeof reviewHelpfulVotes.$inferInsert)[] = [];
  const voterSeen = new Set<string>();
  for (const { reviewId, authorId } of insertedReviewIds) {
    // Votes taper off with age: a review written eleven months ago has had less
    // time to be read than one written last week, so a flat distribution would
    // make the "Most Helpful" sort meaningless.
    const popularity = randInt(0, 12);
    for (let voter = 0; voter < popularity; voter += 1) {
      const userId = pick(buyerIds);
      // Self-votes are refused by the endpoint, so they must not exist here.
      if (userId === authorId) continue;
      const key = `${reviewId}:${userId}`;
      if (voterSeen.has(key)) continue;
      voterSeen.add(key);
      voteRows.push({ reviewId, userId });
    }
  }
  await insertInChunks(voteRows, (batch) => db.insert(reviewHelpfulVotes).values(batch));

  const helpfulTallies = (await db
    .select({ reviewId: reviewHelpfulVotes.reviewId, n: count() })
    .from(reviewHelpfulVotes)
    .groupBy(reviewHelpfulVotes.reviewId)) as unknown as { reviewId: number; n: number }[];
  for (const tally of helpfulTallies) {
    await db
      .update(reviews)
      .set({ helpfulCount: Number(tally.n) })
      .where(eq(reviews.id, tally.reviewId));
  }
  console.log(`  helpful votes: ${voteRows.length}`);

  /* -------------------------------- favorites ------------------------------- */

  console.log("Seeding favourites...");
  const favoriteRows: { userId: number; productId: number; createdAt: Date }[] = [];
  const favoriteSeen = new Set<string>();
  while (favoriteRows.length < TARGETS.favorites) {
    const userId = pick(buyerIds);
    const product = pick(catalogue);
    const key = `${userId}:${product.id}`;
    if (favoriteSeen.has(key)) continue;
    favoriteSeen.add(key);
    favoriteRows.push({ userId, productId: product.id, createdAt: daysAgo(randInt(0, 180)) });
  }
  await insertInChunks(favoriteRows, (batch) => db.insert(favorites).values(batch));

  // Recount rather than incrementing per row: the unique index can make some
  // inserts no-ops, and a wrong badge count is worse than no seed data.
  const favoriteCounts = (await db
    .select({ productId: favorites.productId, n: count() })
    .from(favorites)
    .groupBy(favorites.productId)) as unknown as { productId: number; n: number }[];
  for (const entry of favoriteCounts) {
    await db
      .update(products)
      .set({ favoriteCount: entry.n })
      .where(eq(products.id, entry.productId));
  }
  console.log(`  favourites: ${favoriteRows.length} (counts refreshed on ${favoriteCounts.length} products)`);

  /* ---------------------------- rating aggregates ---------------------------- */

  // Only the listings that actually received a review above. Re-aggregating every
  // product in the catalogue would issue a pointless UPDATE per row for the ~19k
  // that have none.
  console.log("Refreshing rating aggregates...");
  const reviewedProductIds = [
    ...new Set(
      (
        (await db.select({ productId: reviews.productId }).from(reviews)) as unknown as {
          productId: number;
        }[]
      ).map((row) => row.productId),
    ),
  ];
  await refreshProductRatings(reviewedProductIds);
  console.log(`  ratings refreshed on ${reviewedProductIds.length} products`);

  /* ---------------------------------- carts --------------------------------- */

  console.log("Seeding carts...");
  // `carts.user_id` is unique, and the demo seed already gave the named accounts
  // a cart — reusing one of them would abort the whole insert batch, so those
  // users are excluded and simply keep the cart they have.
  const usersWithCarts = new Set(
    (
      (await db.select({ userId: carts.userId }).from(carts)) as unknown as { userId: number }[]
    ).map((row) => row.userId),
  );
  const cartCandidates = buyerIds.filter((userId) => !usersWithCarts.has(userId));
  const cartRows = cartCandidates
    .slice(0, Math.min(TARGETS.carts, cartCandidates.length))
    .map((userId) => ({
      userId,
      createdAt: daysAgo(randInt(0, 120)),
      updatedAt: daysAgo(randInt(0, 14)),
    }));
  const insertedCarts = (await db.insert(carts).values(cartRows).$returningId()) as unknown as {
    id: number;
    userId: number;
  }[];
  const cartItemRows = insertedCarts.flatMap((cart) => {
    const lineCount = randInt(1, 3);
    const seen = new Set<number>();
    const rows: (typeof cartItems.$inferInsert)[] = [];
    for (let i = 0; i < lineCount; i += 1) {
      const product = pick(chance(0.35) ? forRent : forSale);
      if (!product || seen.has(product.id)) continue;
      seen.add(product.id);
      const mode = product.rentalPricePerDay && chance(0.4) ? "RENT" : "BUY";
      const start = dateOnly(randInt(4, 30));
      const end = dateOnly(randInt(0, 3));
      rows.push({
        cartId: Number(cart.id),
        productId: product.id,
        mode,
        quantity: randInt(1, 2),
        startDate: mode === "RENT" ? start : null,
        endDate: mode === "RENT" ? end : null,
        savedForLater: chance(0.2),
        unitPriceSnapshot: mode === "RENT" ? product.rentalPricePerDay : product.purchasePrice,
        createdAt: daysAgo(randInt(0, 30)),
      });
    }
    return rows;
  });
  await insertInChunks(cartItemRows, (batch) => db.insert(cartItems).values(batch));
  console.log(`  carts: ${insertedCarts.length}, cart items: ${cartItemRows.length}`);

  /* ------------------------------ conversations ----------------------------- */

  console.log("Seeding conversations and messages...");
  const conversationRows: (typeof conversations.$inferInsert)[] = [];
  const messagePlan: { conversationIndex: number; senderIsOwner: boolean; body: string; daysAgo: number }[] =
    [];
  const OPENERS = [
    "Hi! Is this still available?",
    "Hello — could you share the condition details?",
    "Hi, is pickup possible this weekend?",
    "Hey, would you consider a slightly lower price?",
    "Hi! Does this come with the original accessories?",
  ];
  const REPLIES = [
    "Yes, it is available. Happy to share more photos if that helps.",
    "It is in very good condition — I have used it twice so far.",
    "Pickup works, I am in Koramangala most weekends.",
    "I can consider it, but not below the listed price, sorry.",
    "Yes, it comes with the box, charger and a bill.",
  ];

  for (let i = 0; i < TARGETS.conversations; i += 1) {
    const product = pick(catalogue);
    const ageDays = randInt(0, 150);
    conversationRows.push({
      productId: product.id,
      createdAt: daysAgo(ageDays),
      lastMessageAt: daysAgo(Math.max(0, ageDays - randInt(0, 5))),
    });
    messagePlan.push({ conversationIndex: i, senderIsOwner: false, body: pick(OPENERS), daysAgo: ageDays });
    if (chance(0.75)) {
      messagePlan.push({ conversationIndex: i, senderIsOwner: true, body: pick(REPLIES), daysAgo: Math.max(0, ageDays - randInt(0, 2)) });
    }
    if (chance(0.25)) {
      messagePlan.push({ conversationIndex: i, senderIsOwner: false, body: pick(OPENERS), daysAgo: Math.max(0, ageDays - randInt(0, 1)) });
    }
  }

  const insertedConversations = (await db
    .insert(conversations)
    .values(conversationRows)
    .$returningId()) as unknown as { id: number; productId: number | null }[];

  const participantRows = insertedConversations.map((conversation, index) => {
    const product = catalogue.find((entry) => entry.id === conversation.productId);
    return {
      conversationId: Number(conversation.id),
      userId: pick(buyerIds),
      ownerId: product?.sellerId ?? sellerIds[0]!,
      lastReadAt: null,
      createdAt: conversationRows[index]?.createdAt ?? new Date(),
    };
  });
  await insertInChunks(
    participantRows.flatMap((row) => [
      { conversationId: row.conversationId, userId: row.userId, lastReadAt: row.lastReadAt },
      { conversationId: row.conversationId, userId: row.ownerId, lastReadAt: row.lastReadAt },
    ]),
    (batch) => db.insert(conversationParticipants).values(batch),
  );

  const messageRows = messagePlan.flatMap((plan) => {
    const conversation = insertedConversations[plan.conversationIndex];
    const participant = participantRows[plan.conversationIndex];
    if (!conversation || !participant) return [];
    return [
      {
        conversationId: Number(conversation.id),
        senderId: plan.senderIsOwner ? participant.ownerId : participant.userId,
        body: plan.body,
        createdAt: daysAgo(plan.daysAgo),
      },
    ];
  });
  await insertInChunks(messageRows, (batch) => db.insert(messages).values(batch));
  console.log(`  conversations: ${insertedConversations.length}, messages: ${messageRows.length}`);

  /* ------------------------------ notifications ----------------------------- */

  console.log("Seeding notifications...");
  const notificationRows: (typeof notifications.$inferInsert)[] = [];
  const NOTIFICATIONS = [
    {
      type: "ORDER_CONFIRMED",
      title: "Order confirmed",
      body: "Your order is confirmed and the seller has been notified.",
      link: "/orders",
    },
    {
      type: "ORDER_SHIPPED",
      title: "Your order has shipped",
      body: "Your parcel is on its way.",
      link: "/orders",
    },
    {
      type: "ORDER_DELIVERED",
      title: "Order delivered",
      body: "Enjoy your purchase — rate the seller when you have a moment.",
      link: "/orders",
    },
    {
      type: "RENTAL_CONFIRMED",
      title: "Rental confirmed",
      body: "Your rental is confirmed. Pickup details are in your rentals.",
      link: "/rentals",
    },
    {
      type: "RENTAL_ENDING_SOON",
      title: "Rental ending soon",
      body: "Your rental window closes soon — extend it if you still need it.",
      link: "/rentals",
    },
    {
      type: "PRICE_DROP",
      title: "Price drop on a saved item",
      body: "Something you saved just got cheaper.",
      link: "/favorites",
    },
    {
      type: "NEW_MESSAGE",
      title: "New message",
      body: "A seller replied to your conversation.",
      link: "/messages",
    },
  ] as const;

  while (notificationRows.length < TARGETS.notifications) {
    const userId = pick(buyerIds);
    const template = pick(NOTIFICATIONS);
    const ageDays = randInt(0, 200);
    notificationRows.push({
      userId,
      type: template.type,
      title: template.title,
      body: template.body,
      link: template.link,
      readAt: chance(0.6) ? daysAgo(Math.max(0, ageDays - randInt(1, 20))) : null,
      createdAt: daysAgo(ageDays),
    });
  }
  await insertInChunks(notificationRows, (batch) => db.insert(notifications).values(batch));
  console.log(`  notifications: ${notificationRows.length}`);

  console.log("\nHistory seed complete.");
  console.log(`  demo login: buyer@revaro.local / ${PASSWORD} (volume accounts use the same password)`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });