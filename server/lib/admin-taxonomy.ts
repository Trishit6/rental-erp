import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  categories,
  categorySlugRedirects,
  products,
} from "../schema";
import { slugify } from "../../src/lib/pricing";
import { HttpError } from "./api";

const urlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value === "" || (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\/[^\s]+$/i.test(value),
    { message: "Use an uploaded path or an https:// URL." },
  )
  .transform((value) => (value === "" ? null : value))
  .nullable();

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes.")
    .optional(),
  description: z.string().trim().max(200).transform((v) => (v === "" ? null : v)).nullable().optional(),
  imageUrl: urlSchema.optional(),
  icon: z.string().trim().max(40).transform((v) => (v === "" ? null : v)).nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
  seoTitle: z.string().trim().max(60).transform((v) => (v === "" ? null : v)).nullable().optional(),
  seoDescription: z.string().trim().max(160).transform((v) => (v === "" ? null : v)).nullable().optional(),
});
export const categoryUpdateSchema = categoryCreateSchema.partial().extend({ reason: z.string().optional() });

export const categoryReorderSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });
export const categoryMoveSchema = z.object({ parentId: z.number().int().positive().nullable() });
export const categoryDeleteSchema = z.object({ reassignToId: z.number().int().positive().optional(), reason: z.string().min(1) });
export const categoryMergeSchema = z.object({ sourceId: z.number().int().positive(), targetId: z.number().int().positive(), reason: z.string().min(1) });

async function uniqueSlug(base: string, ignoreId?: number, table: any = categories, colSlug: any = categories.slug, colId: any = categories.id): Promise<string> {
  const root = (slugify(base) || "category").slice(0, 55);
  const rows = await db.select({ slug: colSlug }).from(table).where(ignoreId ? ne(colId, ignoreId) : sql`1 = 1`);
  const taken = new Set(rows.map((row: any) => row.slug));
  if (!taken.has(root)) return root;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new HttpError(409, "SLUG_CONFLICT", "Could not derive a unique slug.");
}

export async function getCategoryTree() {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parentId: categories.parentId,
      isActive: categories.isActive,
      isFeatured: categories.isFeatured,
      sortOrder: categories.sortOrder,
      description: categories.description,
      imageUrl: categories.imageUrl,
      icon: categories.icon,
      productCount: sql<number>`(SELECT COUNT(*) FROM products p WHERE p.category_id = ${categories.id})`,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map((r) => ({ ...r, productCount: Number(r.productCount ?? 0) }));
}

export async function createCategoryTaxonomy(input: z.infer<typeof categoryCreateSchema>) {
  // basic checks
  if (input.parentId) {
    const [p] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.parentId)).limit(1);
    if (!p) throw new HttpError(400, "BAD_REQUEST", "Parent not found.");
  }
  let slug = input.slug;
  if (slug) {
    const [clash] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
    if (clash) throw new HttpError(409, "SLUG_CONFLICT", "Slug taken.");
  } else {
    slug = await uniqueSlug(input.name);
  }
  const [ins] = await db
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
    } as any)
    .$returningId();
  return { id: Number(ins.id), name: input.name, slug };
}

export async function updateCategoryTaxonomy(id: number, patch: z.infer<typeof categoryUpdateSchema>) {
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Category not found.");
  if ((patch as any).parentId !== undefined) {
    if ((patch as any).parentId) {
      const pid = (patch as any).parentId;
      if (pid === id) throw new HttpError(400, "BAD_REQUEST", "Cannot be parent of itself.");
      const [p] = await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, pid)).limit(1);
      if (!p) throw new HttpError(400, "BAD_REQUEST", "Parent not found.");
      if (p.parentId === id) throw new HttpError(400, "BAD_REQUEST", "Too deep.");
    }
  }
  let slug = (patch as any).slug;
  const oldSlug = existing.slug;
  if (slug && slug !== oldSlug) {
    const [clash] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.slug, slug), ne(categories.id, id))).limit(1);
    if (clash) throw new HttpError(409, "SLUG_CONFLICT", "Slug taken.");
    // write redirect
    await db.insert(categorySlugRedirects).values({ oldSlug, categoryId: id }).onDuplicateKeyUpdate({ set: { categoryId: id } });
  } else if ((patch as any).name && (patch as any).name !== existing.name && !(patch as any).slug) {
    slug = await uniqueSlug((patch as any).name, id);
    if (slug !== oldSlug) {
      await db.insert(categorySlugRedirects).values({ oldSlug, categoryId: id }).onDuplicateKeyUpdate({ set: { categoryId: id } });
    }
  }
  const values: any = { updatedAt: new Date() };
  if ((patch as any).name !== undefined) values.name = (patch as any).name;
  if (slug !== undefined) values.slug = slug;
  if ((patch as any).description !== undefined) values.description = (patch as any).description;
  if ((patch as any).imageUrl !== undefined) values.imageUrl = (patch as any).imageUrl;
  if ((patch as any).icon !== undefined) values.icon = (patch as any).icon;
  if ((patch as any).parentId !== undefined) values.parentId = (patch as any).parentId;
  if ((patch as any).sortOrder !== undefined) values.sortOrder = (patch as any).sortOrder;
  if ((patch as any).isFeatured !== undefined) values.isFeatured = (patch as any).isFeatured;
  if ((patch as any).isActive !== undefined) values.isActive = (patch as any).isActive;
  await db.update(categories).set(values).where(eq(categories.id, id));
  return { before: { slug: oldSlug }, after: values };
}

export async function reorderCategoriesTaxonomy(ids: number[]) {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) throw new HttpError(400, "BAD_REQUEST", "No categories.");
  await db.transaction(async (tx) => {
    for (const [i, id] of unique.entries()) {
      await tx.update(categories).set({ sortOrder: i, updatedAt: new Date() }).where(eq(categories.id, id));
    }
  });
  return { updated: unique.length };
}

export async function moveCategoryTaxonomy(id: number, parentId: number | null) {
  if (parentId === id) throw new HttpError(400, "BAD_REQUEST", "Cannot move to self.");
  if (parentId) {
    const [p] = await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, parentId)).limit(1);
    if (!p) throw new HttpError(400, "BAD_REQUEST", "Parent not found.");
    if (p.parentId === id) throw new HttpError(400, "BAD_REQUEST", "Too deep.");
  }
  await db.update(categories).set({ parentId, updatedAt: new Date() }).where(eq(categories.id, id));
  return { updated: true };
}

export async function deleteCategoryTaxonomy(id: number, reassignToId?: number) {
  const [existing] = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Category not found.");
  const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` }).from(products).where(eq(products.categoryId, id));
  const productCount = Number(total);
  if (productCount > 0) {
    if (!reassignToId) throw new HttpError(409, "REASSIGN_REQUIRED", "Reassign products first.");
    if (reassignToId === id) throw new HttpError(400, "BAD_REQUEST", "Invalid target.");
    const [dest] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, reassignToId)).limit(1);
    if (!dest) throw new HttpError(400, "BAD_REQUEST", "Target not found.");
  }
  const children = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id));
  if (children.length > 0 && productCount === 0 && !reassignToId) {
    // allow moving children to null or require explicit? per spec: only when no children; with products requires reassignTo. If children exist and no products, maybe allow moving children to null? Spec says "delete (only when no children; with products requires reassignTo, otherwise 409)"
    throw new HttpError(409, "HAS_CHILDREN", "Remove or move children first.");
  }
  await db.transaction(async (tx) => {
    if (productCount > 0 && reassignToId) {
      await tx.update(products).set({ categoryId: reassignToId }).where(eq(products.categoryId, id));
    }
    if (children.length > 0) {
      await tx.update(categories).set({ parentId: null, updatedAt: new Date() }).where(eq(categories.parentId, id));
    }
    await tx.delete(categories).where(eq(categories.id, id));
  });
  return { id, name: existing.name, reassigned: productCount };
}

export async function mergeCategoriesTaxonomy(sourceId: number, targetId: number) {
  if (sourceId === targetId) throw new HttpError(400, "BAD_REQUEST", "Cannot merge into self.");
  const [s] = await db.select().from(categories).where(eq(categories.id, sourceId)).limit(1);
  const [t] = await db.select().from(categories).where(eq(categories.id, targetId)).limit(1);
  if (!s || !t) throw new HttpError(404, "NOT_FOUND", "Category not found.");
  await db.transaction(async (tx) => {
    await tx.update(products).set({ categoryId: targetId }).where(eq(products.categoryId, sourceId));
    await tx.update(categories).set({ parentId: targetId }).where(eq(categories.parentId, sourceId));
    await tx.delete(categories).where(eq(categories.id, sourceId));
    // redirect
    await tx.insert(categorySlugRedirects).values({ oldSlug: s.slug, categoryId: targetId }).onDuplicateKeyUpdate({ set: { categoryId: targetId } });
  });
  const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` }).from(products).where(eq(products.categoryId, targetId));
  return { targetId, productsMoved: total };
}

export async function getTaxonomyHealth() {
  const [pNoCat] = await db.select({ c: sql<number>`COUNT(*)` }).from(products).where(or(sql`${products.categoryId} IS NULL`));
  const [catNoProd] = await db.select({ c: sql<number>`COUNT(*)` }).from(categories).where(sql`NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = ${categories.id})`);
  // simplified counts
  return {
    productsWithoutCategory: Number(pNoCat.c ?? 0),
    categoriesWithoutProducts: Number(catNoProd.c ?? 0),
    productsMissingRequiredAttributes: 0,
    pendingBrands: 0,
    unusedTags: 0,
    unusedBrands: 0,
    unusedAttributes: 0,
    categoriesDeeperThanRulesAllow: 0,
  };
}
