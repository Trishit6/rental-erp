import { Router } from "../lib/http";
import { z } from "zod";
import { ok } from "../lib/api";
import { guarded } from "../lib/rate-limit";
import { requirePermission } from "../lib/permissions";
import { withAudit } from "../lib/audit";
import { requireStepUp } from "../lib/auth";
import { listRegistry } from "../lib/settings/registry";
import { getSettingWithMeta, setSetting, resetSetting } from "../lib/settings/service";

export const adminSettingsRoute = new Router();

adminSettingsRoute.get(
  "/settings",
  guarded("admin.action", async (c) => {
    await requirePermission("settings.view")(c, async () => undefined);
    const reg = listRegistry();
    const items = await Promise.all(reg.map((d) => getSettingWithMeta(d.key)));
    // group
    const groups: Record<string, any[]> = {};
    for (const item of items) {
      const g = item.definition?.group ?? "general";
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    }
    return c.json(ok({ items, groups }));
  }),
);

adminSettingsRoute.patch(
  "/settings/:key",
  guarded(
    "admin.action",
    withAudit({ action: "SETTING_UPDATED", entityType: "setting" }, async (c) => {
      await requirePermission("settings.manage")(c, async () => undefined);
      const key = c.req.param("key");
      const body = z
        .object({ value: z.any(), reason: z.string().optional() })
        .parse(await c.req.json().catch(() => ({})));
      const { listRegistry } = await import("../lib/settings/registry");
      const def = listRegistry().find((d) => d.key === key);
      if (def?.sensitive) {
        await requireStepUp(c);
      }
      const user = (c as any).get?.("user");
      const before = await (await import("../lib/settings/service")).getSettingWithMeta(key);
      const res = await setSetting(key, body.value, user?.id ?? null);
      c.json(ok(res));
      return { entityId: 0, before, after: res, details: body.reason ?? `Updated setting ${key}` };
    }),
  ),
);

adminSettingsRoute.delete(
  "/settings/:key",
  guarded(
    "admin.action",
    withAudit({ action: "SETTING_RESET", entityType: "setting" }, async (c) => {
      await requirePermission("settings.manage")(c, async () => undefined);
      const key = c.req.param("key");
      const res = await resetSetting(key);
      c.json(ok(res));
      return { entityId: 0, details: `Reset setting ${key}` };
    }),
  ),
);
