import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { categories, products } from "../schema";
import { slugify } from "../../src/lib/pricing";
import { HttpError } from "./api";

/**
 * Admin write paths for the category taxonomy (PROMPT 26).
 *
 * ## Why "retire" was not enough
 *
 * The first cut of this surface could only flip `isActive`, on the reasoning that
 * `products.category_id` is `ON DELETE RESTRICT` and a deleted category would
 * orphan listings. That is true, but it left administrators unable to do the
 * obvious thing: rename a category, fix its position, or merge a duplicate into
 * another and delete the leftover. This module adds those, and makes the delete
 * *ask where the listings should go* — the reassignment the brief requires — so a
 * delete is only ever possible when nothing is left pointing at the row.
 *
 * ## Slugs are derived, then made unique
 *
 * A slug is the public URL and a search key, so it is generated from the name
 * unless one is supplied, and a collision is resolved by suffixing (`-2`, `-3`)
 * rather than failing: "two categories called Furniture" is a data-entry slip, and
 * the second one still needs a URL.
 */

const categoryUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value === "" || (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\/[^\s]+$/i.test(value),
    { message: "Use an uploaded path or an https:// URL." },
  )
  .transform((value) => (value === "" ? null : value))
  .nullable();

export const categoryWriteSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes.")
    .optional(),
  description: z.string().trim().max(200).transform((v) => (v === "" ? null : v)).nullable().optional(),
  imageUrl: categoryUrlSchema.optional(),
  icon: z.string().trim().max(40).transform((v) => (v === "" ? null : v)).nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type CategoryWrite = z.infer<typeof categoryWriteSchema>;

export const categoryUpdateSchema = categoryWriteSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update." });

export const categoryReorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

export const categoryDeleteSchema = z.object({
  /** Required when the category still has listings. Mutually exclusive with itself. */
  reassignToId: z.number().int().positive().optional(),
});

export type AdminCategoryRow = {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  productCount: number;
};

/** A slug free of collisions, suffixing `-2`, `-3`, … as needed. */
async function uniqueSlug(base: string, ignoreId?: number): Promise<string> {
  const root = (slugify(base) || "category").slice(0, 55);
  const rows = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(ignoreId ? ne(categories.id, ignoreId) : sql`1 = 1`);
  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(root)) return root;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new HttpError(409, "SLUG_CONFLICT", "Could not derive a unique slug for this category.");
}

/** Reject a parent that does not exist, is the category itself, or would nest too deep. */
async function assertParent(id: number | null | undefined, selfId?: number): Promise<void> {
  if (id === null || id === undefined) return;
  if (selfId !== undefined && id === selfId) {
    throw new HttpError(400, "BAD_REQUEST", "A category cannot be its own parent.");
  }
  const [parent] = await db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!parent) throw new HttpError(400, "BAD_REQUEST", "That parent category does not exist.");
  // The schema allows exactly two levels; a grandchild would be a third.
  if (selfId !== undefined && parent.parentId === selfId) {
    throw new HttpError(400, "BAD_REQUEST", "This would nest the taxonomy a third level deep.");
  }
}

export async function createCategory(input: CategoryWrite): Promise<AdminCategoryRow> {
  await assertParent(input.parentId ?? null);
  const slug = input.slug ?? (await uniqueSlug(input.name));

  // A caller that supplies an explicit slug still has to be told when it collides.
  if (input.slug) {
    const [clash] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, input.slug))
      .limit(1);
    if (clash) throw new HttpError(409, "SLUG_CONFLICT", "That slug is already used.");
  }

  const [inserted] = await db
    .insert(categories)
    .values({
      name: input.name,
      slug,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      icon: input.icon ?? null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      isFeatured: input.isFeatured ?? false,
      isActive: input.isActive ?? true,
    })
    .$returningId();

  return {
    id: inserted!.id,
    name: input.name,
    slug,
    parentId: input.parentId ?? null,
    isActive: input.isActive ?? true,
    isFeatured: input.isFeatured ?? false,
    sortOrder: input.sortOrder ?? 0,
    productCount: 0,
  };
}

export type CategoryUpdateResult = {
  id: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export async function updateCategory(
  id: number,
  patch: z.infer<typeof categoryUpdateSchema>,
): Promise<CategoryUpdateResult> {
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Category not found.");

  if (patch.parentId !== undefined) await assertParent(patch.parentId, id);

  let slug = patch.slug;
  if (slug !== undefined) {
    const [clash] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, slug), ne(categories.id, id)))
      .limit(1);
    if (clash) throw new HttpError(409, "SLUG_CONFLICT", "That slug is already used.");
  } else if (patch.name !== undefined && patch.name !== existing.name) {
    slug = await uniqueSlug(patch.name, id);
  }

  const values: Partial<typeof categories.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (slug !== undefined) values.slug = slug;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.imageUrl !== undefined) values.imageUrl = patch.imageUrl;
  if (patch.icon !== undefined) values.icon = patch.icon;
  if (patch.parentId !== undefined) values.parentId = patch.parentId;
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (patch.isFeatured !== undefined) values.isFeatured = patch.isFeatured;
  if (patch.isActive !== undefined) values.isActive = patch.isActive;

  await db.update(categories).set(values).where(eq(categories.id, id));

  const before = {
    name: existing.name,
    slug: existing.slug,
    description: existing.description,
    parentId: existing.parentId,
    sortOrder: existing.sortOrder,
    isFeatured: existing.isFeatured,
    isActive: existing.isActive,
  };
  // Snapshot only the fields the patch actually named, so the audit entry reads
  // "name: Furniture → Seating" rather than restating the whole row.
  const after = {
    ...before,
    ...(values.name !== undefined ? { name: values.name } : {}),
    ...(values.slug !== undefined ? { slug: values.slug } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
    ...(values.sortOrder !== undefined ? { sortOrder: values.sortOrder } : {}),
    ...(values.isFeatured !== undefined ? { isFeatured: values.isFeatured } : {}),
    ...(values.isActive !== undefined ? { isActive: values.isActive } : {}),
  };
  return { id, before, after };
}

export type CategoryDeleteResult = {
  id: number;
  name: string;
  reassigned: number;
  childrenReassigned: number;
  reassignToId: number | null;
};

/**
 * Delete a category, moving its listings first.
 *
 * The reassignment is mandatory when the category is non-empty. `ON DELETE
 * RESTRICT` would otherwise surface as a raw foreign-key error — the least helpful
 * possible answer to "delete this category" — and `SET NULL` (which the child
 * parent reference uses) would silently lose the classification. So the caller is
 * told, up front, that it must choose a destination, and the move and the delete
 * happen in one transaction.
 */
export async function deleteCategory(
  id: number,
  reassignToId?: number,
): Promise<CategoryDeleteResult> {
  const [existing] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Category not found.");

  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.categoryId, id));
  const productCount = Number(total);

  if (productCount > 0) {
    if (!reassignToId) {
      throw new HttpError(
        400,
        "REASSIGN_REQUIRED",
        `This category has ${productCount} listing${productCount === 1 ? "" : "s"}. Choose a category to move them to first.`,
      );
    }
    if (reassignToId === id) {
      throw new HttpError(400, "BAD_REQUEST", "Choose a different category to move the listings to.");
    }
    const [destination] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, reassignToId))
      .limit(1);
    if (!destination) throw new HttpError(400, "BAD_REQUEST", "That destination category does not exist.");
  }

  const children = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, id));

  await db.transaction(async (tx) => {
    if (productCount > 0 && reassignToId) {
      await tx.update(products).set({ categoryId: reassignToId }).where(eq(products.categoryId, id));
    }
    if (children.length > 0) {
      await tx
        .update(categories)
        .set({ parentId: reassignToId ?? null, updatedAt: new Date() })
        .where(eq(categories.parentId, id));
    }
    await tx.delete(categories).where(eq(categories.id, id));
  });

  return {
    id,
    name: existing.name,
    reassigned: productCount,
    childrenReassigned: children.length,
    reassignToId: reassignToId ?? null,
  };
}

/** Apply an explicit order across the whole taxonomy (roots and children share it). */
export async function reorderCategories(ids: number[]): Promise<{ updated: number }> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) throw new HttpError(400, "BAD_REQUEST", "No categories given.");

  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(inArray(categories.id, unique));
  const present = new Set(existing.map((row) => row.id));
  const ordered = unique.filter((id) => present.has(id));

  await db.transaction(async (tx) => {
    for (const [index, id] of ordered.entries()) {
      await tx
        .update(categories)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(eq(categories.id, id));
    }
  });
  return { updated: ordered.length };
}

/** Ascending list used by the seed/facets checks. */
export async function listCategoryIdsByName(): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}
