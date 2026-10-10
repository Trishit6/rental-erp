/**
 * Admin, security, support and growth seeder — the third stage of `pnpm db:seed`.
 *
 * `seed.ts` builds the demo world, `seed-products.ts` the catalogue and
 * `seed-history.ts` the volume marketplace. This script fills the tables those
 * three never touch: RBAC staff, sessions with devices, MFA, login/security
 * events, seller verifications, commission rules, reports, support tickets,
 * refunds, disputes, coupons and their redemptions, CMS content, feature flags,
 * app config, platform settings, the admin audit trail, export jobs, order
 * timelines, checkout holds, webhook receipts, idempotency keys, recent
 * searches and notification preferences.
 *
 * ## Why a separate stage
 *
 * Every row here depends on a real `users` / `orders` / `rentals` /
 * `transactions` row already existing, because a refund against no order or a
 * ticket from no account is not demo data — it is a foreign-key failure waiting
 * to happen. Reading those ids back (rather than inventing them) is what keeps
 * the whole graph honest.
 *
 * ## Deterministic
 *
 * One mulberry32 stream seeded from `SEED_ADMIN` (default `20261002`), so the
 * same run produces the same rows. Dates are relative to "now", as everywhere
 * else in the seeders.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { db, pool } from "./db";
import {
  adminAuditLog,
  appConfig,
  cmsBanners,
  cmsBlocks,
  categories,
  commissionRules,
  couponRedemptions,
  coupons,
  disputes,
  exportJobs,
  featureFlags,
  idempotencyKeys,
  loginAttempts,
  mfaRecoveryCodes,
  notificationPreferences,
  orderEvents,
  orderItems,
  orders,
  paymentWebhookEvents,
  platformSettings,
  products,
  refunds,
  rentals,
  reports,
  roles,
  searchHistory,
  securityEvents,
  sellerProfiles,
  sellerVerifications,
  sessions,
  stockReservations,
  supportTickets,
  ticketAttachments,
  ticketMessages,
  transactions,
  userMfa,
  userRoles,
  users,
} from "./schema";
import { mulberry32 } from "./data/seed-realistic";
import { DEV_PASSWORD, PLATFORM_RENTAL_FEE_PERCENT, PLATFORM_SALE_FEE_PERCENT } from "./lib/config";
import { hashPassword } from "./lib/password";
import { encryptSecretWith, hashRecoveryCode } from "./lib/mfa";

/* --------------------------------- helpers --------------------------------- */

const rand = mulberry32(Number(process.env.SEED_ADMIN ?? 20261002));
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const chance = (probability: number) => rand() < probability;
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (days: number, hour = 12) => {
  const date = new Date(now - days * DAY);
  date.setHours(hour, randInt(0, 59), 0, 0);
  return date;
};

/** A short, collision-checked public identifier. */
function uniqueId(prefix: string, set: Set<string>, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let body = "";
    for (let i = 0; i < 6; i += 1) body += alphabet[Math.floor(rand() * alphabet.length)]!;
    const candidate = `${prefix}${body}`;
    if (!set.has(candidate)) {
      set.add(candidate);
      return candidate;
    }
  }
  throw new Error(`Could not mint a unique ${prefix} id — the RNG is looping.`);
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function insertInChunks<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
  size = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await insert(rows.slice(i, i + size));
  }
}

/* ----------------------------------- main ---------------------------------- */

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed: NODE_ENV is 'production'. There is no override for this.");
    process.exit(1);
  }

  console.log("Revaro admin seed");
  const passwordHash = await hashPassword(DEV_PASSWORD);

  /* ------------------------------ read the base ----------------------------- */

  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users);
  const buyerIds = allUsers.filter((u) => u.role === "USER").map((u) => u.id);
  const sellerIds = allUsers.filter((u) => u.role === "SELLER").map((u) => u.id);
  if (buyerIds.length === 0 || sellerIds.length === 0) {
    throw new Error("No buyers/sellers — run `pnpm db:seed && pnpm db:seed:history` first.");
  }

  const allOrders = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      orderType: orders.orderType,
      total: orders.total,
      paymentStatus: orders.paymentStatus,
      paymentReference: orders.paymentReference,
      createdAt: orders.createdAt,
    })
    .from(orders);
  if (allOrders.length === 0) throw new Error("No orders — run `pnpm db:seed:history` first.");

  const allItems = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      sellerId: orderItems.sellerId,
      productId: orderItems.productId,
      mode: orderItems.mode,
      lineTotal: orderItems.lineTotal,
      rentalCharge: orderItems.rentalCharge,
    })
    .from(orderItems);
  const allRentals = await db
    .select({
      id: rentals.id,
      orderId: rentals.orderId,
      orderItemId: rentals.orderItemId,
      renterId: rentals.renterId,
      ownerId: rentals.ownerId,
      productId: rentals.productId,
      startDate: rentals.startDate,
      endDate: rentals.endDate,
      status: rentals.status,
    })
    .from(rentals);
  const allTransactions = await db
    .select({
      id: transactions.id,
      orderId: transactions.orderId,
      userId: transactions.userId,
      amount: transactions.amount,
      status: transactions.status,
      reference: transactions.providerTransactionId,
    })
    .from(transactions);
  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);

  const firstImage = (await db
    .select({ url: sql<string>`(SELECT url FROM product_images LIMIT 1)` })
    .from(products)
    .limit(1))[0]?.url;
  const fallbackImage =
    firstImage ?? "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200";

  const roleRows = await db.select({ id: roles.id, name: roles.name }).from(roles);
  const roleIdByName = new Map(roleRows.map((r) => [r.name, r.id]));
  const adminUser = allUsers.find((u) => u.email === "admin@admin.com") ?? allUsers.find((u) => u.role === "ADMIN");
  if (!adminUser) throw new Error("No coarse ADMIN account to attribute staff actions to.");

  /* -------------------------------- staff users ------------------------------ */

  console.log("Seeding staff accounts...");
  const STAFF: { name: string; email: string; roleName: string }[] = [
    { name: "Ravi Sundaram", email: "root@revaro.local", roleName: "SUPER_ADMIN" },
    { name: "Neha Kulkarni", email: "support@revaro.local", roleName: "SUPPORT" },
    { name: "Vikram Rao", email: "finance@revaro.local", roleName: "FINANCE" },
    { name: "Ananya Bose", email: "moderator@revaro.local", roleName: "MODERATOR" },
    { name: "Imran Sheikh", email: "content@revaro.local", roleName: "CONTENT_MANAGER" },
  ];
  const staffIds = (
    await db
      .insert(users)
      .values(
        STAFF.map((s) => ({
          name: s.name,
          email: s.email,
          passwordHash,
          role: "ADMIN" as const,
          verified: true,
          mustChangePassword: true,
          mustEnrollMfa: true,
        })),
      )
      .$returningId()
  ).map((row) => Number(row.id));

  await db.insert(userRoles).values(
    STAFF.map((s, index) => {
      const roleId = roleIdByName.get(s.roleName);
      if (roleId === undefined) throw new Error(`Role ${s.roleName} was not seeded by db:seed.`);
      return { userId: staffIds[index]!, roleId, grantedBy: adminUser.id };
    }),
  );
  // The existing demo administrator carries the coarse ADMIN role from seed.ts;
  // grant the matching RBAC row so the two vocabularies agree.
  const adminRoleId = roleIdByName.get("ADMIN");
  if (adminRoleId !== undefined) {
    const existing = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.userId, adminUser.id));
    if (existing.length === 0) {
      await db.insert(userRoles).values({ userId: adminUser.id, roleId: adminRoleId });
    }
  }
  const superAdminId = staffIds[0]!;

  /* ----------------------------------- MFA ---------------------------------- */

  /**
   * Demo MFA is *real* MFA: an actual AES-256-GCM-encrypted base32 secret with a
   * plaintext derived from this run's PRNG, so the staff demo accounts can
   * genuinely complete a challenge — the secret is printed below, once, to be
   * loaded into an authenticator app. Two things keep the seeding deterministic:
   *
   * - The IV is derived from the user id (SHA-256, first 12 bytes) instead of
   *   being random, so two `pnpm db:seed` runs write byte-identical ciphertext.
   * - Recovery codes are generated from a per-user digest and stored with the
   *   same `hashRecoveryCode` the runtime verifier uses.
   */
  const DEMO_MFA_SECRET = Array.from(
    { length: 32 },
    () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[Math.floor(rand() * 32)],
  ).join("");
  const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const mfaEnvelope = (userId: number) =>
    encryptSecretWith(
      DEMO_MFA_SECRET,
      createHash("sha256").update(`mfa-iv:${userId}`).digest().subarray(0, 12),
    );
  const demoRecoveryCode = (userId: number, index: number) => {
    const digest = createHash("sha256").update(`recovery:${userId}:${index}`).digest();
    const chars = Array.from(
      { length: 8 },
      (_, k) => RECOVERY_ALPHABET[digest[k]! % RECOVERY_ALPHABET.length],
    );
    return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
  };
  const mfaStaff = [adminUser.id, superAdminId] as const;
  const mfaRecoveryByUser = new Map<number, string[]>();

  console.log("Seeding MFA enrolments...");
  await db.insert(userMfa).values([
    {
      userId: adminUser.id,
      secretEncrypted: mfaEnvelope(adminUser.id),
      enabledAt: daysAgo(120),
      lastUsedAt: daysAgo(0),
    },
    {
      userId: superAdminId,
      secretEncrypted: mfaEnvelope(superAdminId),
      enabledAt: daysAgo(90),
      lastUsedAt: daysAgo(1),
    },
  ]);
  const recoveryRows: { userId: number; codeHash: string; usedAt: Date | null }[] = [];
  for (const userId of mfaStaff) {
    const codes = Array.from({ length: 6 }, (_, i) => demoRecoveryCode(userId, i));
    mfaRecoveryByUser.set(userId, codes);
    codes.forEach((code, i) => {
      recoveryRows.push({
        userId,
        codeHash: hashRecoveryCode(code),
        usedAt: i === 5 ? daysAgo(randInt(1, 30)) : null,
      });
    });
  }
  await db.insert(mfaRecoveryCodes).values(recoveryRows);
  // These two accounts finish the demo with a working second factor, so the
  // "must enrol" flag (set by `seed.ts` for every staff account) is cleared —
  // otherwise the profile prompt and the real state would disagree forever.
  await db.update(users).set({ mustEnrollMfa: false }).where(eq(users.id, adminUser.id));
  await db.update(users).set({ mustEnrollMfa: false }).where(eq(users.id, superAdminId));

  /* --------------------------------- sessions ------------------------------- */

  console.log("Seeding sessions and devices...");
  const devices = [
    { label: "Chrome on Windows", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0" },
    { label: "Safari on iPhone", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/604.1" },
    { label: "Firefox on Ubuntu", ua: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) Firefox/125.0" },
    { label: "Edge on Mac", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) Edg/124.0" },
    { label: "Revero Android app", ua: "Revero/1.4 (Android 14; Pixel 8)" },
  ];
  const sessionPool = [...buyerIds.slice(0, 40), ...sellerIds.slice(0, 12), adminUser.id, superAdminId];
  const sessionRows = sessionPool.flatMap((userId, index) =>
    Array.from({ length: randInt(1, 2) }, (_, n) => {
      const device = pick(devices);
      const token = `${userId}:${index}:${n}:${rand()}`;
      const revoked = chance(0.15);
      return {
        id: `sess_${sha256(token).slice(0, 32)}`,
        userId,
        refreshTokenHash: sha256(`refresh:${token}`),
        previousRefreshTokenHash: null,
        rotatedAt: daysAgo(randInt(0, 30)),
        expiresAt: new Date(now + randInt(3, 60) * DAY),
        revokedAt: revoked ? daysAgo(randInt(0, 20)) : null,
        revokedBy: revoked ? adminUser.id : null,
        lastSeenAt: daysAgo(randInt(0, 20)),
        deviceLabel: device.label,
        ip: `${randInt(49, 117)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
        userAgent: device.ua,
        mfaVerifiedAt: userId === adminUser.id || userId === superAdminId ? daysAgo(randInt(0, 5)) : null,
        lastUsedAt: daysAgo(randInt(0, 20)),
      };
    }),
  );
  await insertInChunks(sessionRows, (batch) => db.insert(sessions).values(batch));

  /* --------------------------- login / security ------------------------------ */

  console.log("Seeding login attempts and security events...");
  const attemptRows: (typeof loginAttempts.$inferInsert)[] = [];
  for (let i = 0; i < 160; i += 1) {
    const success = chance(0.7);
    const user = pick(allUsers);
    attemptRows.push({
      identifier: user.email,
      userId: success || chance(0.5) ? user.id : null,
      ip: `${randInt(49, 117)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
      userAgent: pick(devices).ua,
      success,
      failureReason: success ? null : pick(["bad_password", "rate_limited", "no_such_user"] as const),
      createdAt: daysAgo(randInt(0, 180)),
    });
  }
  await insertInChunks(attemptRows, (batch) => db.insert(loginAttempts).values(batch));

  const SECURITY_TYPES = [
    "LOGIN_SUCCESS",
    "LOGIN_FAILURE",
    "PASSWORD_CHANGED",
    "MFA_ENABLED",
    "MFA_CHALLENGE_PASSED",
    "SESSION_REVOKED",
    "ROLE_GRANTED",
    "PERMISSION_DENIED",
  ] as const;
  const securityRows: (typeof securityEvents.$inferInsert)[] = [];
  for (let i = 0; i < 140; i += 1) {
    securityRows.push({
      userId: pick(allUsers).id,
      type: pick(SECURITY_TYPES),
      ip: `${randInt(49, 117)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
      userAgent: pick(devices).ua,
      details: JSON.stringify({ source: "seed", at: i }),
      createdAt: daysAgo(randInt(0, 180)),
    });
  }
  await insertInChunks(securityRows, (batch) => db.insert(securityEvents).values(batch));

  /* --------------------------- seller verifications -------------------------- */

  console.log("Seeding seller verifications...");
  const verificationRows: (typeof sellerVerifications.$inferInsert)[] = sellerIds.slice(0, 30).map((sellerId) => {
    const status = pick(["PENDING", "VERIFIED", "REJECTED", "EXPIRED"] as const);
    const submittedAt = daysAgo(randInt(5, 300));
    const reviewed = status === "VERIFIED" || status === "REJECTED" || status === "EXPIRED";
    return {
      sellerId,
      status,
      documentType: pick(["PAN", "GSTIN", "AADHAAR", "DRIVING_LICENCE"] as const),
      documentRefHash: sha256(`doc:${sellerId}`),
      submittedAt,
      reviewedAt: reviewed ? new Date(submittedAt.getTime() + randInt(1, 10) * DAY) : null,
      reviewedBy: reviewed ? adminUser.id : null,
      rejectionReason: status === "REJECTED" ? "Name on the document did not match the account." : null,
      createdAt: submittedAt,
    };
  });
  await insertInChunks(verificationRows, (batch) => db.insert(sellerVerifications).values(batch));

  /* ------------------------------ commission rules --------------------------- */

  console.log("Seeding commission rules...");
  const commissionRows: (typeof commissionRules.$inferInsert)[] = [
    {
      scope: "GLOBAL",
      percentBp: 500,
      fixedFeePaise: 0,
      effectiveFrom: daysAgo(360),
      createdBy: adminUser.id,
    },
    {
      scope: "GLOBAL",
      percentBp: 600,
      fixedFeePaise: 0,
      effectiveFrom: daysAgo(30),
      createdBy: adminUser.id,
    },
  ];
  for (const category of categoryRows.slice(0, 4)) {
    commissionRows.push({
      scope: "CATEGORY",
      categoryId: category.id,
      percentBp: randInt(300, 900),
      fixedFeePaise: 0,
      effectiveFrom: daysAgo(randInt(60, 300)),
      createdBy: adminUser.id,
    });
  }
  for (const sellerId of sellerIds.slice(0, 4)) {
    commissionRows.push({
      scope: "SELLER",
      sellerId,
      percentBp: randInt(200, 700),
      fixedFeePaise: 0,
      effectiveFrom: daysAgo(randInt(30, 180)),
      createdBy: adminUser.id,
    });
  }
  await db.insert(commissionRules).values(commissionRows);

  /* --------------------------------- reports -------------------------------- */

  console.log("Seeding reports...");
  const productRows = await db.select({ id: products.id, sellerId: products.sellerId }).from(products).limit(400);
  const reportRows: (typeof reports.$inferInsert)[] = [];
  for (let i = 0; i < 50; i += 1) {
    const aboutProduct = chance(0.7);
    const product = pick(productRows);
    const reportedUser = pick(allUsers);
    reportRows.push({
      reporterId: pick(buyerIds),
      productId: aboutProduct ? product.id : null,
      reportedUserId: aboutProduct ? product.sellerId : reportedUser.id,
      reason: pick(["SPAM", "COUNTERFEIT", "MISLEADING", "OFFENSIVE", "OTHER"] as const),
      details: pick([
        "The listing photos look like stock images, not the actual item.",
        "Seller stopped replying after payment.",
        "Description says new but the item is clearly used.",
        "This account keeps posting the same listing.",
      ]),
      status: pick(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const),
      createdAt: daysAgo(randInt(0, 200)),
    });
  }
  await insertInChunks(reportRows, (batch) => db.insert(reports).values(batch));

  /* ------------------------------ support tickets ---------------------------- */

  console.log("Seeding support tickets...");
  const ticketNumbers = new Set<string>();
  const supportStaff = staffIds[1] ?? adminUser.id;
  const ticketSubjects = [
    "Refund not received after cancellation",
    "Seller has not shipped my order",
    "Unable to upload listing photos",
    "Rental return date is wrong",
    "Payment failed but amount debited",
    "Account locked after MFA reset",
    "Wrong item delivered",
    "How do I change my payout method?",
  ];
  const ticketRows: (typeof supportTickets.$inferInsert)[] = [];
  const ticketAssignee: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    const userId = pick(buyerIds);
    const order = pick(allOrders);
    const status = pick(["OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const);
    const createdAt = daysAgo(randInt(0, 200));
    const assigneeId = status === "OPEN" && chance(0.5) ? null : chance(0.5) ? supportStaff : adminUser.id;
    ticketRows.push({
      ticketNumber: uniqueId("RV-T-", ticketNumbers),
      userId,
      assigneeId,
      orderId: chance(0.6) ? order.id : null,
      subject: pick(ticketSubjects),
      status,
      priority: pick(["LOW", "NORMAL", "HIGH", "URGENT"] as const),
      slaDueAt: chance(0.8) ? new Date(createdAt.getTime() + randInt(1, 5) * DAY) : null,
      createdAt,
    });
    ticketAssignee.push(assigneeId ?? supportStaff);
  }
  const insertedTickets = await db.insert(supportTickets).values(ticketRows).$returningId();

  const CUSTOMER_LINES = [
    "Hi, I raised this a few days ago and have not heard back yet.",
    "Adding more detail: the order number is in my account, please take a look.",
    "Any update on this? Happy to share screenshots if that helps.",
    "Thanks, that resolved it on my side.",
  ];
  const STAFF_LINES = [
    "Thanks for reaching out — I am looking into this now.",
    "I have raised a refund request with our finance team.",
    "Could you confirm the last four digits of the payment reference?",
    "Closing this as resolved; please reopen if it happens again.",
  ];
  const messageRows: (typeof ticketMessages.$inferInsert)[] = [];
  ticketRows.forEach((ticket, index) => {
    const ticketId = Number(insertedTickets[index]!.id);
    const assignments: ("customer" | "staff" | "internal")[] = ["customer"];
    if (ticket.status !== "OPEN") assignments.push("staff");
    if (chance(0.4)) assignments.push("internal");
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") assignments.push("customer");
    assignments.forEach((kind, n) => {
      messageRows.push({
        ticketId,
        authorId: kind === "customer" ? ticket.userId : staffIds[1 + (n % (staffIds.length - 1))]!,
        body:
          kind === "customer"
            ? pick(CUSTOMER_LINES)
            : kind === "staff"
              ? pick(STAFF_LINES)
              : "Internal: checked the ledger, the refund was queued on our side.",
        isInternal: kind === "internal",
        createdAt: new Date(ticket.createdAt!.getTime() + (n + 1) * 3600 * 1000),
      });
    });
  });
  const insertedMessages = await db.insert(ticketMessages).values(messageRows).$returningId();

  const attachmentRows: (typeof ticketAttachments.$inferInsert)[] = [];
  insertedMessages.forEach((message, index) => {
    if (chance(0.12)) {
      attachmentRows.push({
        ticketMessageId: Number(message.id),
        fileName: pick(["screenshot.png", "receipt.pdf", "error-log.txt"] as const),
        url: `${fallbackImage.split("?")[0]}?seed-attachment=${index}`,
        mimeType: "image/png",
        sizeBytes: randInt(20_000, 2_000_000),
      });
    }
  });
  if (attachmentRows.length > 0) {
    await insertInChunks(attachmentRows, (batch) => db.insert(ticketAttachments).values(batch));
  }

  /* --------------------------------- refunds -------------------------------- */

  console.log("Seeding refunds and disputes...");
  const refundNumbers = new Set<string>();
  const paidOrders = allOrders.filter((o) => o.paymentStatus === "PAID" || o.status === "CANCELLED");
  const refundRows: (typeof refunds.$inferInsert)[] = [];
  for (let i = 0; i < 34; i += 1) {
    const order = pick(paidOrders);
    const transaction = allTransactions.find((t) => t.orderId === order.id);
    const status = pick(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"] as const);
    const refundNumber = uniqueId("RV-RF-", refundNumbers);
    refundRows.push({
      refundNumber,
      orderId: order.id,
      orderItemId: null,
      transactionId: transaction?.id ?? null,
      userId: order.userId,
      amount: Math.max(100, Math.round(order.total * (chance(0.4) ? 1 : 0.5))),
      reason: pick(["Order cancelled by customer", "Item not as described", "Delivery never arrived", "Duplicate charge"] as const),
      status,
      providerReference: `mock_refund_${refundNumber.slice(-6)}`,
      idempotencyKey: `seed-refund:${refundNumber}`,
      createdBy: adminUser.id,
      createdAt: daysAgo(randInt(0, 200)),
    });
  }
  await insertInChunks(refundRows, (batch) => db.insert(refunds).values(batch));

  const disputeNumbers = new Set<string>();
  const disputeRows: (typeof disputes.$inferInsert)[] = [];
  for (let i = 0; i < 26; i += 1) {
    const order = pick(allOrders);
    const item = allItems.find((entry) => entry.orderId === order.id);
    const againstUserId = item?.sellerId ?? pick(sellerIds);
    const status = pick(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"] as const);
    const createdAt = daysAgo(randInt(0, 200));
    const resolved = status === "RESOLVED" || status === "DISMISSED";
    disputeRows.push({
      disputeNumber: uniqueId("RV-D-", disputeNumbers),
      orderId: order.id,
      openedBy: order.userId,
      againstUserId,
      status,
      reason: pick(["ITEM_NOT_AS_DESCRIBED", "NOT_RETURNED", "DAMAGED", "REFUND_NOT_RECEIVED"] as const),
      description: "Customer and seller disagree about the condition of the item on return.",
      resolution: resolved ? "Reviewed by support; both parties notified." : null,
      resolvedBy: resolved ? supportStaff : null,
      resolvedAt: resolved ? new Date(createdAt.getTime() + randInt(1, 20) * DAY) : null,
      createdAt,
    });
  }
  await insertInChunks(disputeRows, (batch) => db.insert(disputes).values(batch));

  /* --------------------------------- coupons -------------------------------- */

  console.log("Seeding coupons and redemptions...");
  const couponRows: (typeof coupons.$inferInsert)[] = [
    { code: "WELCOME10", description: "10% off the first order", discountType: "PERCENT", discountValue: 1000, maxDiscountPaise: 50_000, minimumOrderPaise: 50_000, usageLimit: 500, perUserLimit: 1, status: "ACTIVE", appliesTo: "ALL", createdBy: adminUser.id },
    { code: "RENTFLAT200", description: "₹200 off any rental", discountType: "FLAT", discountValue: 20_000, minimumOrderPaise: 100_000, usageLimit: 200, perUserLimit: 2, status: "ACTIVE", appliesTo: "ALL", createdBy: adminUser.id },
    { code: "FURNITURE15", description: "15% off furniture", discountType: "PERCENT", discountValue: 1500, maxDiscountPaise: 200_000, usageLimit: 100, perUserLimit: 1, status: "ACTIVE", appliesTo: "CATEGORY", categoryId: categoryRows[1]?.id ?? null, createdBy: adminUser.id },
    { code: "DIWALI25", description: "Festive 25% off, capped", discountType: "PERCENT", discountValue: 2500, maxDiscountPaise: 150_000, usageLimit: 300, perUserLimit: 1, status: "SCHEDULED", startsAt: daysAgo(-10), endsAt: daysAgo(-40), createdBy: adminUser.id },
    { code: "SUMMER50", description: "Expired summer promotion", discountType: "FLAT", discountValue: 5_000, usageLimit: 100, perUserLimit: 1, status: "PAUSED", startsAt: daysAgo(200), endsAt: daysAgo(120), createdBy: adminUser.id },
    { code: "FIRSTBUY", description: "Flat ₹150 off, new buyers", discountType: "FLAT", discountValue: 15_000, minimumOrderPaise: 30_000, usageLimit: 1000, perUserLimit: 1, status: "ACTIVE", appliesTo: "ALL", createdBy: adminUser.id },
  ];
  const insertedCoupons = await db.insert(coupons).values(couponRows).$returningId();

  const redemptionRows: (typeof couponRedemptions.$inferInsert)[] = [];
  const usedPerCoupon = new Map<number, number>();
  const seenRedemption = new Set<string>();
  for (const order of allOrders) {
    if (redemptionRows.length >= 160) break;
    if (!chance(0.3)) continue;
    if (order.paymentStatus !== "PAID") continue;
    const couponIndex = randInt(0, insertedCoupons.length - 1);
    const couponId = Number(insertedCoupons[couponIndex]!.id);
    const key = `${couponId}:${order.id}`;
    if (seenRedemption.has(key)) continue;
    seenRedemption.add(key);
    redemptionRows.push({
      couponId,
      userId: order.userId,
      orderId: order.id,
      discountPaise: Math.max(500, Math.round(order.total * 0.1)),
      createdAt: order.createdAt!,
    });
    usedPerCoupon.set(couponId, (usedPerCoupon.get(couponId) ?? 0) + 1);
  }
  if (redemptionRows.length > 0) {
    await db.insert(couponRedemptions).values(redemptionRows);
    for (const [couponId, used] of usedPerCoupon) {
      await db.update(coupons).set({ usedCount: used }).where(eq(coupons.id, couponId));
    }
  }

  /* ----------------------------------- CMS ---------------------------------- */

  console.log("Seeding CMS content...");
  const bannerRows: (typeof cmsBanners.$inferInsert)[] = [
    { placement: "HERO", title: "Rent the gear, not the regret", subtitle: "Cameras, furniture and tools by the day.", imageUrl: fallbackImage, linkUrl: "/browse?mode=RENT", sortOrder: 0, status: "ACTIVE", createdBy: adminUser.id },
    { placement: "HERO", title: "Buy pre-loved, save more", subtitle: "Inspected listings from verified sellers.", imageUrl: fallbackImage, linkUrl: "/pre-loved", sortOrder: 1, status: "ACTIVE", createdBy: adminUser.id },
    { placement: "CATEGORY_STRIP", title: "Furniture edit", subtitle: "Warm oak, soft linen.", imageUrl: fallbackImage, linkUrl: "/categories/furniture", sortOrder: 0, status: "ACTIVE", createdBy: adminUser.id },
    { placement: "CATEGORY_STRIP", title: "Studio & photography", subtitle: "Bodies, lenses and lighting.", imageUrl: fallbackImage, linkUrl: "/categories/cameras", sortOrder: 1, status: "ACTIVE", createdBy: adminUser.id },
    { placement: "FOOTER", title: "Sell with Revaro", subtitle: "List in minutes.", imageUrl: fallbackImage, linkUrl: "/sell", sortOrder: 0, status: "ACTIVE", createdBy: adminUser.id },
    { placement: "HERO", title: "Festive rentals", subtitle: "Book early for the season.", imageUrl: fallbackImage, linkUrl: "/browse", sortOrder: 2, status: "SCHEDULED", startsAt: daysAgo(-5), endsAt: daysAgo(-25), createdBy: adminUser.id },
  ];
  await db.insert(cmsBanners).values(bannerRows);

  await db.insert(cmsBlocks).values([
    { blockKey: "home.hero", content: JSON.stringify({ heading: "Rent. Buy. Sell. Reuse.", sub: "A marketplace that keeps things in use." }), status: "ACTIVE", createdBy: adminUser.id },
    { blockKey: "footer.legal", content: JSON.stringify({ lines: ["Terms", "Privacy", "Refunds"] }), status: "ACTIVE", createdBy: adminUser.id },
    { blockKey: "how_it_works.intro", content: JSON.stringify({ title: "How Revaro works", steps: 3 }), status: "ACTIVE", createdBy: adminUser.id },
    { blockKey: "trust.badges", content: JSON.stringify({ badges: ["Verified sellers", "Secure payments", "7-day returns"] }), status: "ACTIVE", createdBy: adminUser.id },
    { blockKey: "home.promo", content: JSON.stringify({ text: "Draft promo — not live yet." }), status: "DRAFT", createdBy: adminUser.id },
  ]);

  /* -------------------------------- config ---------------------------------- */

  console.log("Seeding config and flags...");
  await db.insert(featureFlags).values([
    { key: "rent_to_own", description: "Rent-to-own checkout flow", enabled: true, rolloutPercent: 100, audience: "ALL", createdBy: adminUser.id },
    { key: "smart_search", description: "Typo-tolerant search", enabled: true, rolloutPercent: 100, audience: "ALL", createdBy: adminUser.id },
    { key: "new_checkout", description: "Rebuilt checkout", enabled: true, rolloutPercent: 25, audience: "BETA", createdBy: adminUser.id },
    { key: "seller_analytics_v2", description: "Seller analytics rewrite", enabled: false, rolloutPercent: 0, audience: "SELLER", createdBy: adminUser.id },
    { key: "staff_bulk_actions", description: "Bulk admin actions", enabled: true, rolloutPercent: 100, audience: "ADMIN", createdBy: adminUser.id },
    { key: "email_notifications", description: "Outbound email", enabled: false, rolloutPercent: 0, audience: "ALL", createdBy: adminUser.id },
  ]);

  await db.insert(appConfig).values([
    { configKey: "min_client_version", value: JSON.stringify("1.0.0"), updatedBy: adminUser.id },
    { configKey: "maintenance_mode", value: JSON.stringify(false), updatedBy: adminUser.id },
    { configKey: "maintenance_message", value: JSON.stringify("We will be back shortly."), updatedBy: adminUser.id },
    { configKey: "support_hours", value: JSON.stringify({ from: "09:00", to: "21:00", timezone: "Asia/Kolkata" }), updatedBy: adminUser.id },
    { configKey: "checkout_hold_minutes", value: JSON.stringify(15), updatedBy: adminUser.id },
  ]);

  await db.insert(platformSettings).values([
    { key: "platform.fees", value: { salePercent: PLATFORM_SALE_FEE_PERCENT, rentalPercent: PLATFORM_RENTAL_FEE_PERCENT }, description: "Commission percentages", updatedBy: adminUser.id },
    { key: "checkout.reservation_ttl_minutes", value: { minutes: 15 }, description: "Stock hold lifetime", updatedBy: adminUser.id },
    { key: "support.sla_hours", value: { low: 48, normal: 24, high: 8, urgent: 2 }, description: "Ticket SLA by priority", updatedBy: adminUser.id },
    { key: "search.min_query_length", value: { characters: 2 }, description: "Shortest searchable query", updatedBy: adminUser.id },
    { key: "payouts.minimum_paise", value: { amount: 50_000 }, description: "Smallest payout request", updatedBy: adminUser.id },
  ]);

  /* ------------------------------- audit trail ------------------------------- */

  console.log("Seeding audit log and export jobs...");
  const auditRows: (typeof adminAuditLog.$inferInsert)[] = [];
  const AUDIT_ACTIONS = [
    { action: "PRODUCT_STATUS_SET", entityType: "product" },
    { action: "USER_SUSPENDED", entityType: "user" },
    { action: "PAYOUT_STATUS_SET", entityType: "payout" },
    { action: "REVIEW_HIDDEN", entityType: "review" },
    { action: "REPORT_RESOLVED", entityType: "report" },
    { action: "SETTING_UPDATED", entityType: "setting" },
    { action: "COUPON_CREATED", entityType: "coupon" },
  ] as const;
  const allEntityIds = [...allOrders.map((o) => o.id), ...allUsers.map((u) => u.id)];
  for (let i = 0; i < 120; i += 1) {
    const entry = pick(AUDIT_ACTIONS);
    auditRows.push({
      adminId: chance(0.7) ? adminUser.id : pick(staffIds),
      action: entry.action,
      entityType: entry.entityType,
      entityId: pick(allEntityIds),
      details: pick([
        "Status changed by an administrator.",
        "Actioned from the admin queue.",
        "Requested by the customer via support.",
        "Routine review of flagged content.",
      ]),
      createdAt: daysAgo(randInt(0, 240)),
    });
  }
  await insertInChunks(auditRows, (batch) => db.insert(adminAuditLog).values(batch));

  const jobKeys = new Set<string>();
  const exportRows: (typeof exportJobs.$inferInsert)[] = [];
  const EXPORT_TYPES = ["ORDERS", "PAYOUTS", "AUDIT_LOG", "PRODUCTS", "TRANSACTIONS"] as const;
  for (let i = 0; i < 14; i += 1) {
    const status = pick(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"] as const);
    const createdAt = daysAgo(randInt(0, 120));
    exportRows.push({
      jobKey: uniqueId("EXP-", jobKeys),
      type: pick(EXPORT_TYPES),
      requestedBy: chance(0.6) ? adminUser.id : pick(staffIds),
      scope: JSON.stringify({ from: daysAgo(30).toISOString(), to: new Date().toISOString() }),
      status,
      fileUrl: status === "SUCCEEDED" ? `https://exports.revaro.local/${uniqueId("file-", new Set())}.csv` : null,
      errorMessage: status === "FAILED" ? "The export timed out; try a narrower date range." : null,
      rowCount: status === "SUCCEEDED" ? randInt(50, 5000) : null,
      expiresAt: new Date(createdAt.getTime() + 7 * DAY),
      createdAt,
    });
  }
  await db.insert(exportJobs).values(exportRows);

  /* ------------------------------- foundation -------------------------------- */

  console.log("Seeding order timelines, holds and webhook receipts...");
  const eventRows: (typeof orderEvents.$inferInsert)[] = [];
  const sampleOrders = allOrders.slice(0, Math.min(allOrders.length, 260));
  sampleOrders.forEach((order, index) => {
    const created = order.createdAt ?? daysAgo(randInt(1, 200));
    eventRows.push({
      orderId: order.id,
      type: "CREATED",
      fromStatus: null,
      toStatus: "PENDING_PAYMENT",
      actorId: order.userId,
      actorRole: "USER",
      note: "Order placed",
      eventKey: `seed-order-event:${order.id}:created`,
      createdAt: created,
    });
    if (order.status !== "PENDING_PAYMENT") {
      eventRows.push({
        orderId: order.id,
        type: "STATUS_CHANGED",
        fromStatus: "PENDING_PAYMENT",
        toStatus: order.status,
        actorId: chance(0.5) ? order.userId : pick(sellerIds),
        actorRole: chance(0.5) ? "USER" : "SELLER",
        note: "Status advanced during fulfilment",
        eventKey: `seed-order-event:${order.id}:${index}`,
        createdAt: new Date(created.getTime() + randInt(1, 72) * 3600 * 1000),
      });
    }
  });
  await insertInChunks(eventRows, (batch) => db.insert(orderEvents).values(batch));

  const reservationRows: (typeof stockReservations.$inferInsert)[] = [];
  for (let i = 0; i < 70; i += 1) {
    const product = pick(productRows);
    const userId = pick(buyerIds);
    const start = daysAgo(randInt(-10, 10));
    const end = new Date(start.getTime() + randInt(3, 10) * DAY);
    const status = pick(["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"] as const);
    reservationRows.push({
      productId: product.id,
      userId,
      orderId: status === "CONSUMED" ? pick(allOrders).id : null,
      quantity: randInt(1, 2),
      rentalStart: chance(0.5) ? start : null,
      rentalEnd: chance(0.5) ? end : null,
      expiresAt: daysAgo(randInt(-2, 30)),
      status,
      createdAt: daysAgo(randInt(0, 30)),
    });
  }
  await insertInChunks(reservationRows, (batch) => db.insert(stockReservations).values(batch));

  const webhookRows: (typeof paymentWebhookEvents.$inferInsert)[] = [];
  for (let i = 0; i < 40; i += 1) {
    const status = pick(["RECEIVED", "PROCESSED", "FAILED", "IGNORED"] as const);
    const createdAt = daysAgo(randInt(0, 120));
    webhookRows.push({
      provider: "mock",
      providerEventId: `mock_evt_${i}_${sha256(`${i}`).slice(0, 8)}`,
      eventType: pick(["payment.captured", "payment.failed", "refund.processed", "payment.authorized"] as const),
      payload: JSON.stringify({ id: `mock_evt_${i}`, amount: randInt(10_000, 5_000_000), currency: "INR" }),
      signatureVerified: chance(0.85),
      status,
      errorMessage: status === "FAILED" ? "Signature did not match the configured secret." : null,
      processedAt: status === "PROCESSED" ? new Date(createdAt.getTime() + 60_000) : null,
      createdAt,
    });
  }
  await insertInChunks(webhookRows, (batch) => db.insert(paymentWebhookEvents).values(batch));

  const idempotencyRows: (typeof idempotencyKeys.$inferInsert)[] = [];
  const seenIdem = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const scope = pick(["order.create", "payment.create", "payout.request", "coupon.apply"] as const);
    const key = `seed-${scope}-${i}`;
    if (seenIdem.has(`${scope}:${key}`)) continue;
    seenIdem.add(`${scope}:${key}`);
    idempotencyRows.push({
      scope,
      key,
      userId: pick(buyerIds),
      requestHash: sha256(`${scope}:${key}`),
      statusCode: pick([200, 201, 409] as const),
      responseBody: JSON.stringify({ ok: true, seeded: true }),
      expiresAt: daysAgo(randInt(-30, 60)),
    });
  }
  await db.insert(idempotencyKeys).values(idempotencyRows);

  /* ------------------------------ search history ----------------------------- */

  console.log("Seeding recent searches and notification preferences...");
  const SEARCH_TERMS = [
    "camera", "sofa", "gaming laptop", "tent", "bike", "projector", "guitar",
    "office chair", "drone", "air fryer", "treadmill", "monitor", "microphone",
  ] as const;
  const searchRows: (typeof searchHistory.$inferInsert)[] = [];
  const seenSearch = new Set<string>();
  for (const userId of buyerIds.slice(0, 80)) {
    for (let i = 0; i < randInt(1, 4); i += 1) {
      const term = pick(SEARCH_TERMS);
      const key = `${userId}:${term}`;
      if (seenSearch.has(key)) continue;
      seenSearch.add(key);
      searchRows.push({ userId, term, resultCount: randInt(0, 400), createdAt: daysAgo(randInt(0, 90)) });
    }
  }
  await insertInChunks(searchRows, (batch) => db.insert(searchHistory).values(batch));

  const existingPrefs = new Set(
    (await db.select({ userId: notificationPreferences.userId }).from(notificationPreferences)).map((r) => r.userId),
  );
  const prefRows: (typeof notificationPreferences.$inferInsert)[] = [];
  for (const user of allUsers) {
    if (existingPrefs.has(user.id)) continue;
    // Only a slice opt out of email — a preference table where everyone has the
    // same values cannot tell a working toggle from an ignored one.
    prefRows.push({
      userId: user.id,
      ordersEmail: chance(0.8),
      rentalsEmail: chance(0.75),
      paymentsEmail: chance(0.85),
      sellerEmail: user.role === "SELLER" ? chance(0.6) : false,
      wishlistInApp: chance(0.9),
      adminInApp: user.role === "ADMIN" ? chance(0.95) : true,
    });
  }
  await insertInChunks(prefRows, (batch) => db.insert(notificationPreferences).values(batch));

  /* ------------------------------ transactions ------------------------------- */

  console.log("Seeding transactions in every status...");
  const adminOrders = allOrders.slice(0, 24);
  const statusCycle = ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED", "REFUNDED"] as const;
  const extraTransactions: (typeof transactions.$inferInsert)[] = adminOrders.map((order, index) => ({
    userId: order.userId,
    orderId: order.id,
    type: statusCycle[index % statusCycle.length] === "REFUNDED" ? "REFUND" : "PAYMENT",
    amount: order.total,
    status: statusCycle[index % statusCycle.length]!,
    provider: "mock",
    providerTransactionId: `mock_admin_${order.id}_${index}`,
    paymentMethod: pick(["UPI", "CARD", "NET_BANKING", "WALLET"] as const),
    failureReason:
      statusCycle[index % statusCycle.length] === "FAILED" ? "The bank declined the payment." : null,
    createdAt: order.createdAt ?? daysAgo(randInt(1, 120)),
  }));
  await insertInChunks(extraTransactions, (batch) => db.insert(transactions).values(batch));

  /* ------------------ disputed rental + seller aggregates -------------------- */

  // A disputed rental must be traceable to a real dispute; history's random
  // chance may not produce one every run, so pin one deterministically.
  const disputeOrderIds = new Set(disputeRows.map((d) => d.orderId));
  const disputedRental = allRentals.find((rental) => disputeOrderIds.has(rental.orderId));
  if (disputedRental) {
    await db.update(rentals).set({ status: "DISPUTED" }).where(eq(rentals.id, disputedRental.id));
  }

  console.log("Recomputing seller aggregates...");
  const gross = new Map<number, number>();
  const net = new Map<number, number>();
  for (const item of allItems) {
    const line = item.lineTotal ?? 0;
    const rentalCharge = item.rentalCharge ?? 0;
    const feePercent = item.mode === "RENT" ? PLATFORM_RENTAL_FEE_PERCENT : PLATFORM_SALE_FEE_PERCENT;
    // The commission base is the line total for a sale and the rental charge for
    // a rental (the refundable deposit is never commissionable).
    const commissionable = item.mode === "RENT" ? rentalCharge : line;
    gross.set(item.sellerId, (gross.get(item.sellerId) ?? 0) + line);
    net.set(item.sellerId, (net.get(item.sellerId) ?? 0) + (line - Math.round((commissionable * feePercent) / 100)));
  }
  const listingCounts = await db
    .select({ sellerId: products.sellerId, n: count() })
    .from(products)
    .groupBy(products.sellerId);
  const ratingRows = await db
    .select({
      sellerId: products.sellerId,
      avg: sql<string>`AVG(${products.ratingAverage})`,
      total: sql<string>`SUM(${products.ratingCount})`,
    })
    .from(products)
    .groupBy(products.sellerId);
  const ratingBySeller = new Map(
    ratingRows.map((row) => [row.sellerId, { avg: Number(row.avg ?? 0), total: Number(row.total ?? 0) }]),
  );
  for (const sellerId of sellerIds) {
    const ratings = ratingBySeller.get(sellerId);
    await db
      .update(sellerProfiles)
      .set({
        totalSalesPaise: gross.get(sellerId) ?? 0,
        totalEarningsPaise: net.get(sellerId) ?? 0,
        listingsCount: Number(listingCounts.find((row) => row.sellerId === sellerId)?.n ?? 0),
        ratingAverage: ratings ? Math.round(ratings.avg * 100) / 100 : 0,
        ratingCount: ratings?.total ?? 0,
      })
      .where(eq(sellerProfiles.userId, sellerId));
  }

  console.log("\nAdmin seed complete.");
  console.log(`  staff: ${STAFF.length} (super admin ${STAFF[0]!.email})`);
  console.log(`  tickets: ${insertedTickets.length}, refunds: ${refundRows.length}, disputes: ${disputeRows.length}`);
  console.log(`  staff password: ${DEV_PASSWORD} (change on first login)`);
  console.log(`  MFA secret: ${DEMO_MFA_SECRET}  (load into any authenticator app)`);
  console.log(`  admin recovery: ${mfaRecoveryByUser.get(adminUser.id)!.join("  ")}`);
  console.log(`  root recovery:  ${mfaRecoveryByUser.get(superAdminId)!.join("  ")}`);
  console.log(`  other staff: enrol MFA after first login (mandatory for staff areas)`);
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
