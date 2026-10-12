import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { adminAuditLog, cmsBanners, cmsBlocks, users } from "../schema";
import { HttpError } from "./api";
import { BANNER_PLACEMENTS, CMS_STATUSES, type BannerPlacement } from "./enums";
import { cachedPublic, invalidatePublicCache } from "./public-cache";

/**
 * The CMS: banners and homepage blocks (PROMPT 26).
 *
 * ## The two halves of "content"
 *
 * A **banner** is a scheduled, ordered slot on a page (`HERO`, `CATEGORY_STRIP`,
 * `FOOTER`). Its whole life is a window — `startsAt` opens it, `endsAt` closes it —
 * so visibility is a *computed* property, not a stored one: a banner does not need
 * a cron job to "expire", it simply stops matching the window predicate.
 *
 * A **block** is keyed content a component looks up by name (`home.how_it_works`,
 * `home.promo`). It has a draft and a published state, and — because a home page
 * is expensive to get wrong — every write keeps its previous value in the audit
 * trail, which is what the editor's "history" tab reads. There is no separate
 * versions table: `admin_audit_log` already stores the curated before/after for
 * every admin mutation, so a second copy would be a second thing to keep in sync.
 *
 * ## Escaping
 *
 * Nothing here returns HTML. Content is structured JSON that React renders as
 * text, and a URL is validated to be a same-origin path or an `https:` absolute —
 * so `javascript:` cannot be stored and then rendered into an `href`.
 */

/* ------------------------------- vocabularies ------------------------------- */

export const BANNER_STATUSES = CMS_STATUSES;
export const BLOCK_STATUSES = ["DRAFT", "PUBLISHED"] as const;

/* --------------------------------- url rules -------------------------------- */

/**
 * A link an admin may store: an in-app path (`/browse`) or an absolute `https:`
 * URL. Deliberately not `http:`, not `//host`, and — the reason this exists at all
 * — not `javascript:` or `data:`, which would turn a banner into stored XSS the
 * moment a component renders it into an `href`.
 */
export const contentUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      value === "" ||
      (value.startsWith("/") && !value.startsWith("//")) ||
      /^https:\/\/[^\s]+$/i.test(value),
    { message: "Use an in-app path starting with / or an https:// URL." },
  )
  .transform((value) => (value === "" ? null : value))
  .nullable();

const imageUrlSchema = z
  .string()
  .trim()
  .min(1, "An image is required.")
  .max(500)
  .refine(
    (value) => (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\/[^\s]+$/i.test(value),
    { message: "Use an uploaded image path or an https:// URL." },
  );

const title = z.string().trim().min(1, "A title is required.").max(120);
const subtitle = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value === "" ? null : value))
  .nullable();

/* ------------------------------ pure visibility ----------------------------- */

export type BannerWindow = {
  status: string;
  placement: string;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
};

function asTime(value: Date | string | null): number | null {
  if (value === null) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Whether a banner is live at `now`.
 *
 * Exported and pure so the "a scheduled banner appears and expires on time"
 * acceptance test does not need a database or a clock to be mocked at the SQL
 * layer: give it a window and a moment and it answers.
 *
 * `SCHEDULED` and `ACTIVE` are both live when the window is open — the status is
 * the *operator's* intent ("this is scheduled"), while the window is the fact. A
 * `PAUSED` or `DRAFT` banner is never live regardless of its dates.
 */
export function isBannerLive(banner: BannerWindow, now: Date): boolean {
  if (banner.status !== "ACTIVE" && banner.status !== "SCHEDULED") return false;
  const starts = asTime(banner.startsAt);
  const ends = asTime(banner.endsAt);
  if (starts !== null && starts > now.getTime()) return false;
  if (ends !== null && ends <= now.getTime()) return false;
  return true;
}

/** Live banners for one placement, ordered by `sortOrder` then id. */
export function liveBannersFor<T extends BannerWindow>(
  banners: T[],
  placement: string | null,
  now: Date,
): T[] {
  return banners
    .filter((banner) => (placement === null ? true : banner.placement === placement))
    .filter((banner) => isBannerLive(banner, now))
    .sort((a, b) => {
      const order = (a as { sortOrder?: number }).sortOrder ?? 0;
      const other = (b as { sortOrder?: number }).sortOrder ?? 0;
      if (order !== other) return order - other;
      return ((a as { id?: number }).id ?? 0) - ((b as { id?: number }).id ?? 0);
    });
}

/* ------------------------------ block content ------------------------------- */

/**
 * The blocks the app knows how to render, and the shape each one must have.
 *
 * A key that is not listed is still storable (the CMS is meant to be usable
 * without a developer), but its content is only checked to be a non-empty JSON
 * object — the renderer decides what to do with it. Known keys get a real schema,
 * so a "how it works" block cannot be published missing its steps.
 */
export const BLOCK_DEFINITIONS = {
  "home.how_it_works": {
    label: "How it works",
    description: "The numbered steps under the hero.",
    schema: z.object({
      title: z.string().trim().min(1).max(120),
      steps: z
        .array(
          z.object({
            title: z.string().trim().min(1).max(80),
            body: z.string().trim().min(1).max(300),
          }),
        )
        .min(1)
        .max(8),
    }),
  },
  "home.promo": {
    label: "Homepage promo",
    description: "A call-to-action strip promoting a collection or offer.",
    schema: z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(300),
      ctaLabel: z.string().trim().min(1).max(40),
      ctaHref: contentUrlSchema,
    }),
  },
  "home.featured": {
    label: "Featured products",
    description: "Curated listings shown on the home page.",
    schema: z.object({
      title: z.string().trim().min(1).max(120),
      subtitle: z.string().trim().max(200).optional().default(""),
      productIds: z.array(z.number().int().positive()).max(24),
    }),
  },
} as const;

export type BlockKey = keyof typeof BLOCK_DEFINITIONS;

const genericBlockSchema = z.record(z.string(), z.unknown());

/**
 * Validate a block's content against its definition (or the generic object rule
 * for a custom key). Returns the parsed value so the caller stores the *cleaned*
 * shape rather than the raw body.
 */
export function parseBlockContent(key: string, content: unknown): Record<string, unknown> {
  const definition = (BLOCK_DEFINITIONS as Record<string, { schema: z.ZodTypeAny }>)[key];
  const schema = definition?.schema ?? genericBlockSchema;
  const result = schema.safeParse(content);
  if (!result.success) {
    throw new HttpError(
      400,
      "INVALID_BLOCK_CONTENT",
      `That content does not match the ${key} block: ${result.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  if (Object.keys(result.data as Record<string, unknown>).length === 0) {
    throw new HttpError(400, "INVALID_BLOCK_CONTENT", "Block content cannot be empty.");
  }
  return result.data as Record<string, unknown>;
}

/** Parse a stored block, degrading to `null` rather than throwing on drift. */
export function readBlockContent(key: string, raw: string): Record<string, unknown> | null {
  try {
    return parseBlockContent(key, JSON.parse(raw));
  } catch {
    return null;
  }
}

/* --------------------------------- schemas ---------------------------------- */

export const bannerInputSchema = z
  .object({
    placement: z.enum(BANNER_PLACEMENTS),
    title,
    subtitle,
    imageUrl: imageUrlSchema,
    linkUrl: contentUrlSchema,
    sortOrder: z.number().int().min(0).max(999).default(0),
    status: z.enum(BANNER_STATUSES).default("DRAFT"),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
  })
  .refine(
    (value) => !(value.startsAt && value.endsAt) || value.endsAt.getTime() > value.startsAt.getTime(),
    { message: "The end must be after the start.", path: ["endsAt"] },
  );

export type BannerInput = z.infer<typeof bannerInputSchema>;

export const bannerUpdateSchema = z
  .object({
    placement: z.enum(BANNER_PLACEMENTS).optional(),
    title: title.optional(),
    subtitle: subtitle.optional(),
    imageUrl: imageUrlSchema.optional(),
    linkUrl: contentUrlSchema.optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    status: z.enum(BANNER_STATUSES).optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update." });

export type BannerUpdate = z.infer<typeof bannerUpdateSchema>;

export const bannerReorderSchema = z.object({
  placement: z.enum(BANNER_PLACEMENTS),
  ids: z.array(z.number().int().positive()).min(1).max(100),
});

export const blockWriteSchema = z.object({
  content: z.record(z.string(), z.unknown()),
  status: z.enum(BLOCK_STATUSES).optional(),
});

/* ------------------------------- admin reads -------------------------------- */

type BannerRow = typeof cmsBanners.$inferSelect;

export type AdminBanner = BannerRow & { createdByName: string | null };

export async function listAdminBanners(): Promise<AdminBanner[]> {
  const rows = await db
    .select({
      id: cmsBanners.id,
      placement: cmsBanners.placement,
      title: cmsBanners.title,
      subtitle: cmsBanners.subtitle,
      imageUrl: cmsBanners.imageUrl,
      linkUrl: cmsBanners.linkUrl,
      sortOrder: cmsBanners.sortOrder,
      status: cmsBanners.status,
      startsAt: cmsBanners.startsAt,
      endsAt: cmsBanners.endsAt,
      createdBy: cmsBanners.createdBy,
      createdAt: cmsBanners.createdAt,
      updatedAt: cmsBanners.updatedAt,
      createdByName: users.name,
    })
    .from(cmsBanners)
    .leftJoin(users, eq(cmsBanners.createdBy, users.id))
    .orderBy(asc(cmsBanners.placement), asc(cmsBanners.sortOrder), asc(cmsBanners.id));
  return rows;
}

export type AdminBlock = {
  id: number;
  blockKey: string;
  content: Record<string, unknown> | null;
  rawContent: string;
  status: string;
  updatedAt: Date;
  /** Whether the key has a definition, so the editor can label it. */
  known: boolean;
};

export async function listAdminBlocks(): Promise<AdminBlock[]> {
  const rows = await db.select().from(cmsBlocks).orderBy(asc(cmsBlocks.blockKey));
  return rows.map(toAdminBlock);
}

export async function getAdminBlock(key: string): Promise<AdminBlock | null> {
  const [row] = await db.select().from(cmsBlocks).where(eq(cmsBlocks.blockKey, key)).limit(1);
  return row ? toAdminBlock(row) : null;
}

function toAdminBlock(row: typeof cmsBlocks.$inferSelect): AdminBlock {
  return {
    id: row.id,
    blockKey: row.blockKey,
    content: readBlockContent(row.blockKey, row.content),
    rawContent: row.content,
    status: row.status,
    updatedAt: row.updatedAt,
    known: row.blockKey in BLOCK_DEFINITIONS,
  };
}

/** The keys the editor should always offer, whether or not a row exists yet. */
export function blockCatalogue(): { key: string; label: string; description: string }[] {
  return Object.entries(BLOCK_DEFINITIONS).map(([key, definition]) => ({
    key,
    label: definition.label,
    description: definition.description,
  }));
}

/* ------------------------------- admin writes ------------------------------- */

export type BannerWriteResult = {
  id: number;
  action: "created" | "updated" | "unchanged";
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};

function bannerSnapshot(row: BannerRow): Record<string, unknown> {
  return {
    placement: row.placement,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.imageUrl,
    linkUrl: row.linkUrl,
    sortOrder: row.sortOrder,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

export async function createBanner(input: BannerInput, actorId: number): Promise<BannerWriteResult> {
  const [inserted] = await db
    .insert(cmsBanners)
    .values({
      placement: input.placement,
      title: input.title,
      subtitle: input.subtitle,
      imageUrl: input.imageUrl,
      linkUrl: input.linkUrl,
      sortOrder: input.sortOrder,
      status: input.status,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdBy: actorId,
    })
    .$returningId();

  invalidatePublicCache();
  const [row] = await db.select().from(cmsBanners).where(eq(cmsBanners.id, inserted!.id)).limit(1);
  return {
    id: inserted!.id,
    action: "created",
    before: null,
    after: row ? bannerSnapshot(row) : {},
  };
}

export async function updateBanner(
  id: number,
  patch: BannerUpdate,
): Promise<BannerWriteResult> {
  const [existing] = await db.select().from(cmsBanners).where(eq(cmsBanners.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Banner not found.");

  // Re-validate the *window* against the merged row: patching only `endsAt` must
  // still be checked against the stored `startsAt`.
  const startsAt = patch.startsAt !== undefined ? patch.startsAt : existing.startsAt;
  const endsAt = patch.endsAt !== undefined ? patch.endsAt : existing.endsAt;
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new HttpError(400, "BAD_REQUEST", "The end must be after the start.");
  }

  await db
    .update(cmsBanners)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(cmsBanners.id, id));
  invalidatePublicCache();

  const [row] = await db.select().from(cmsBanners).where(eq(cmsBanners.id, id)).limit(1);
  return {
    id,
    action: "updated",
    before: bannerSnapshot(existing),
    after: row ? bannerSnapshot(row) : {},
  };
}

export async function deleteBanner(id: number): Promise<{ before: Record<string, unknown> }> {
  const [existing] = await db.select().from(cmsBanners).where(eq(cmsBanners.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Banner not found.");
  await db.delete(cmsBanners).where(eq(cmsBanners.id, id));
  invalidatePublicCache();
  return { before: bannerSnapshot(existing) };
}

/**
 * Reorder one placement's banners to match `ids`.
 *
 * Ids not belonging to the placement are skipped, and rows the caller did not
 * mention keep their relative order after the ones they did — a partial list is a
 * client bug, but the server's answer should still be a stable order rather than a
 * half-applied permutation.
 */
export async function reorderBanners(
  placement: BannerPlacement,
  ids: number[],
): Promise<{ updated: number }> {
  const rows = await db
    .select({ id: cmsBanners.id })
    .from(cmsBanners)
    .where(eq(cmsBanners.placement, placement))
    .orderBy(asc(cmsBanners.sortOrder), asc(cmsBanners.id));
  const present = new Set(rows.map((row) => row.id));
  const ordered = ids.filter((id) => present.has(id));
  // Append anything the caller left out, so nothing is dropped from the ordering.
  for (const row of rows) if (!ordered.includes(row.id)) ordered.push(row.id);

  await db.transaction(async (tx) => {
    for (const [index, id] of ordered.entries()) {
      await tx
        .update(cmsBanners)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(and(eq(cmsBanners.id, id), eq(cmsBanners.placement, placement)));
    }
  });
  invalidatePublicCache();
  return { updated: ordered.length };
}

export type BlockWriteResult = {
  id: number;
  blockKey: string;
  action: "created" | "updated";
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};

/**
 * Create or replace a block's content.
 *
 * `status` is optional and defaults to keeping the stored status (or `DRAFT` for a
 * new key), so "save" from the editor never accidentally publishes.
 */
export async function upsertBlock(
  key: string,
  input: { content: Record<string, unknown>; status?: (typeof BLOCK_STATUSES)[number] },
  actorId: number,
): Promise<BlockWriteResult> {
  const parsed = parseBlockContent(key, input.content);
  const serialised = JSON.stringify(parsed);
  const [existing] = await db.select().from(cmsBlocks).where(eq(cmsBlocks.blockKey, key)).limit(1);

  if (!existing) {
    const status = input.status ?? "DRAFT";
    const [inserted] = await db
      .insert(cmsBlocks)
      .values({ blockKey: key, content: serialised, status, createdBy: actorId })
      .$returningId();
    invalidatePublicCache();
    return {
      id: inserted!.id,
      blockKey: key,
      action: "created",
      before: null,
      after: { content: parsed, status },
    };
  }

  const status = input.status ?? existing.status;
  await db
    .update(cmsBlocks)
    .set({ content: serialised, status, updatedAt: new Date() })
    .where(eq(cmsBlocks.id, existing.id));
  invalidatePublicCache();

  return {
    id: existing.id,
    blockKey: key,
    action: "updated",
    before: { content: readBlockContent(key, existing.content), status: existing.status },
    after: { content: parsed, status },
  };
}

export async function setBlockStatus(
  key: string,
  status: (typeof BLOCK_STATUSES)[number],
): Promise<BlockWriteResult> {
  const [existing] = await db.select().from(cmsBlocks).where(eq(cmsBlocks.blockKey, key)).limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Block not found.");
  await db
    .update(cmsBlocks)
    .set({ status, updatedAt: new Date() })
    .where(eq(cmsBlocks.id, existing.id));
  invalidatePublicCache();
  return {
    id: existing.id,
    blockKey: key,
    action: "updated",
    before: { content: readBlockContent(key, existing.content), status: existing.status },
    after: { content: readBlockContent(key, existing.content), status },
  };
}

export async function deleteBlock(key: string): Promise<{ before: Record<string, unknown> }> {
  const [existing] = await db.select().from(cmsBlocks).where(eq(cmsBlocks.blockKey, key)).limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Block not found.");
  await db.delete(cmsBlocks).where(eq(cmsBlocks.id, existing.id));
  invalidatePublicCache();
  return {
    before: { content: readBlockContent(key, existing.content), status: existing.status },
  };
}

/* --------------------------------- versions --------------------------------- */

export type CmsVersion = {
  id: number;
  action: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  adminName: string | null;
  createdAt: Date;
};

/**
 * The history of one block or banner, read from the audit trail.
 *
 * `entityType` is `cms_block` or `cms_banner`, matching what the handlers pass to
 * `withAudit`.
 */
export async function listCmsVersions(
  entityType: "cms_block" | "cms_banner",
  entityId: number,
  limit = 20,
): Promise<CmsVersion[]> {
  const rows = await db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      reason: adminAuditLog.reason,
      beforeState: adminAuditLog.beforeState,
      afterState: adminAuditLog.afterState,
      adminName: users.name,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(adminAuditLog.adminId, users.id))
    .where(and(eq(adminAuditLog.entityType, entityType), eq(adminAuditLog.entityId, entityId)))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit);

  const parse = (value: string | null): unknown => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    reason: row.reason,
    before: parse(row.beforeState),
    after: parse(row.afterState),
    adminName: row.adminName,
    createdAt: row.createdAt,
  }));
}

/* -------------------------------- public reads ------------------------------ */

export type PublicBanner = {
  id: number;
  placement: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
};

/**
 * The banners a visitor should see, optionally for one placement.
 *
 * Reads every live-capable banner once and filters in memory with the same
 * `isBannerLive` the tests exercise, so the rule cannot diverge between "what the
 * API returns" and "what the test asserts". The row count here is tiny (content is
 * authored by hand), which is what makes that acceptable.
 */
export async function listPublicBanners(placement?: string | null): Promise<PublicBanner[]> {
  const key = `cms:banners:${placement ?? "all"}`;
  return cachedPublic(key, async () => {
    const rows = await db
      .select({
        id: cmsBanners.id,
        placement: cmsBanners.placement,
        title: cmsBanners.title,
        subtitle: cmsBanners.subtitle,
        imageUrl: cmsBanners.imageUrl,
        linkUrl: cmsBanners.linkUrl,
        sortOrder: cmsBanners.sortOrder,
        status: cmsBanners.status,
        startsAt: cmsBanners.startsAt,
        endsAt: cmsBanners.endsAt,
      })
      .from(cmsBanners)
      .where(inArray(cmsBanners.status, ["ACTIVE", "SCHEDULED"]))
      .orderBy(asc(cmsBanners.sortOrder), asc(cmsBanners.id));

    const now = new Date();
    return liveBannersFor(rows, placement ?? null, now).map((row) => ({
      id: row.id,
      placement: row.placement,
      title: row.title,
      subtitle: row.subtitle,
      imageUrl: row.imageUrl,
      linkUrl: row.linkUrl,
      sortOrder: row.sortOrder,
    }));
  });
}

/** A published block, or `null` when it is missing, unpublished or malformed. */
export async function getPublicBlock(key: string): Promise<Record<string, unknown> | null> {
  return cachedPublic(`cms:block:${key}`, async () => {
    const [row] = await db
      .select({ content: cmsBlocks.content, status: cmsBlocks.status })
      .from(cmsBlocks)
      .where(eq(cmsBlocks.blockKey, key))
      .limit(1);
    if (!row || row.status !== "PUBLISHED") return null;
    return readBlockContent(key, row.content);
  });
}

/** Every published block, keyed — one request for a page that reads several. */
export async function listPublicBlocks(): Promise<Record<string, Record<string, unknown>>> {
  return cachedPublic("cms:blocks:all", async () => {
    const rows = await db
      .select({ blockKey: cmsBlocks.blockKey, content: cmsBlocks.content })
      .from(cmsBlocks)
      .where(eq(cmsBlocks.status, "PUBLISHED"));
    const result: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      const parsed = readBlockContent(row.blockKey, row.content);
      if (parsed) result[row.blockKey] = parsed;
    }
    return result;
  });
}

/** Exposed for the schema/seed drift checks. */
export const CMS_TABLES = [cmsBanners, cmsBlocks] as const;

/** A count used by the admin dashboard's content card (kept here for cohesion). */
export async function countCmsRows(): Promise<{ banners: number; blocks: number }> {
  const [[banners], [blocks]] = await Promise.all([
    db.select({ value: sql<number>`COUNT(*)` }).from(cmsBanners),
    db.select({ value: sql<number>`COUNT(*)` }).from(cmsBlocks),
  ]);
  return { banners: Number(banners.value), blocks: Number(blocks.value) };
}
