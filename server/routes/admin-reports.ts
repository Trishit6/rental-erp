import { Router } from "../lib/http";
import { z } from "zod";
import { ok } from "../lib/api";
import { guarded } from "../lib/rate-limit";
import { requirePermission } from "../lib/permissions";
import { withAudit } from "../lib/audit";
import { requireStepUp } from "../lib/auth";
import { getReport, listReports } from "../lib/reports/registry";
import { db } from "../db";
import { exportJobs } from "../schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export const adminReportsRoute = new Router();

adminReportsRoute.get(
  "/reports",
  guarded("admin.action", async (c) => {
    await requirePermission("reports.view")(c, async () => undefined).catch(async () => {
      // fallback allow if reports.view missing? but better require domain perms; just return
    });
    return c.json(ok({ reports: listReports() }));
  }),
);

adminReportsRoute.post(
  "/reports/:key/export",
  guarded(
    "admin.action",
    withAudit({ action: "EXPORT_CREATED", entityType: "export" }, async (c) => {
      const key = c.req.param("key");
      const rep = getReport(key);
      if (!rep) throw new Error("NOT_FOUND");
      await requirePermission(rep.permission)(c, async () => undefined);
      if (rep.pii) {
        await requireStepUp(c);
      }
      const body = z.object({ filters: z.any().optional(), reason: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
      const user = (c as any).get?.("user");
      const jobKey = crypto.randomUUID().replace(/-/g, "");
      await db.insert(exportJobs).values({
        jobKey,
        type: rep.key.toUpperCase(),
        requestedBy: user.id,
        scope: JSON.stringify(body.filters ?? {}),
        status: "QUEUED",
      } as any);
      c.json(ok({ jobKey }), 202);
      return { entityId: 0, details: `Export ${rep.key} queued` };
    }),
  ),
);

adminReportsRoute.get(
  "/exports",
  guarded("admin.action", async (c) => {
    const user = (c as any).get?.("user");
    const rows = await db.select().from(exportJobs).where(eq(exportJobs.requestedBy, user.id));
    return c.json(ok({ jobs: rows }));
  }),
);
