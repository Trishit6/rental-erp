import { Router } from "../lib/http";
import { ok } from "../lib/api";
import { guarded } from "../lib/rate-limit";
import { requirePermission } from "../lib/permissions";
import { withAudit } from "../lib/audit";
import { requireStepUp } from "../lib/auth";
import {
  getCategoryTree,
  createCategoryTaxonomy,
  updateCategoryTaxonomy,
  reorderCategoriesTaxonomy,
  moveCategoryTaxonomy,
  deleteCategoryTaxonomy,
  mergeCategoriesTaxonomy,
  getTaxonomyHealth,
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryReorderSchema,
  categoryMoveSchema,
  categoryDeleteSchema,
  categoryMergeSchema,
} from "../lib/admin-taxonomy";
import { db } from "../db";
import { brands } from "../schema";
import { and, asc, eq, sql } from "drizzle-orm";

export const taxonomyRoutes = new Router();

taxonomyRoutes.get(
  "/categories",
  guarded("admin.action", async (c) => {
    await requirePermission("taxonomy.view")(c, async () => undefined);
    return c.json(ok(await getCategoryTree()));
  }),
);

taxonomyRoutes.post(
  "/categories",
  guarded(
    "admin.action",
    withAudit({ action: "CATEGORY_CREATED", entityType: "category" }, async (c) => {
      await requirePermission("taxonomy.manage")(c, async () => undefined);
      const input = categoryCreateSchema.parse(await c.req.json().catch(() => ({})));
      const created = await createCategoryTaxonomy(input);
      c.json(ok(created), 201);
      return { entityId: created.id, details: "Created category." };
    }),
  ),
);

taxonomyRoutes.patch(
  "/categories/:id",
  guarded(
    "admin.action",
    withAudit({ action: "CATEGORY_UPDATED", entityType: "category" }, async (c) => {
      await requirePermission("taxonomy.manage")(c, async () => undefined);
      const id = Number(c.req.param("id"));
      const patch = categoryUpdateSchema.parse(await c.req.json().catch(() => ({})));
      const res = await updateCategoryTaxonomy(id, patch);
      c.json(ok({ id, updated: true }));
      return { entityId: id, before: res.before, after: res.after };
    }),
  ),
);

taxonomyRoutes.patch(
  "/categories/reorder",
  guarded(
    "admin.action",
    withAudit({ action: "CATEGORY_REORDERED", entityType: "category" }, async (c) => {
      await requirePermission("taxonomy.manage")(c, async () => undefined);
      const input = categoryReorderSchema.parse(await c.req.json().catch(() => ({})));
      const res = await reorderCategoriesTaxonomy(input.ids);
      c.json(ok(res));
      return { details: "Reordered categories." };
    }),
  ),
);

taxonomyRoutes.patch(
  "/categories/:id/move",
  guarded(
    "admin.action",
    withAudit({ action: "CATEGORY_MOVED", entityType: "category" }, async (c) => {
      await requirePermission("taxonomy.manage")(c, async () => undefined);
      const id = Number(c.req.param("id"));
      const input = categoryMoveSchema.parse(await c.req.json().catch(() => ({})));
      const res = await moveCategoryTaxonomy(id, input.parentId);
      c.json(ok(res));
      return { entityId: id };
    }),
  ),
);

taxonomyRoutes.delete(
  "/categories/:id",
  guarded(
    "admin.action",
    withAudit({ action: "CATEGORY_DELETED", entityType: "category", requireReason: true }, async (c) => {
      await requirePermission("taxonomy.manage")(c, async () => undefined);
      const id = Number(c.req.param("id"));
      const input = categoryDeleteSchema.parse(await c.req.json().catch(() => ({})));
      const res = await deleteCategoryTaxonomy(id, input.reassignToId);
      c.json(ok(res));
      return { entityId: id, details: "Deleted category." };
    }),
  ),
);

taxonomyRoutes.post(
  "/categories/merge",
  guarded(
    "admin.action",
    withAudit({ action: "CATEGORY_MERGED", entityType: "category", requireReason: true }, async (c) => {
      await requirePermission("taxonomy.manage")(c, async () => undefined);
      await requireStepUp(c);
      const input = categoryMergeSchema.parse(await c.req.json().catch(() => ({})));
      const res = await mergeCategoriesTaxonomy(input.sourceId, input.targetId);
      c.json(ok(res));
      return { entityId: input.targetId, details: "Merged categories." };
    }),
  ),
);

taxonomyRoutes.get(
  "/health",
  guarded("admin.action", async (c) => {
    await requirePermission("taxonomy.view")(c, async () => undefined);
    return c.json(ok(await getTaxonomyHealth()));
  }),
);

taxonomyRoutes.get(
  "/brands",
  guarded("admin.action", async (c) => {
    await requirePermission("taxonomy.view")(c, async () => undefined);
    const q = c.req.query("q") ?? undefined;
    const status = c.req.query("status") ?? undefined;
    const where = [] as any[];
    if (q) where.push(sql`(${brands.name} LIKE ${"%" + q + "%"} OR ${brands.slug} LIKE ${"%" + q + "%"})`);
    if (status) where.push(eq(brands.status, status));
    const rows = await db.select().from(brands).where(where.length ? and(...where) : undefined).orderBy(asc(brands.name));
    return c.json(ok(rows));
  }),
);
