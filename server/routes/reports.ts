import { Router } from "../lib/http";
import { ok } from "../lib/api";
import { guarded } from "../lib/rate-limit";
import { requireUser } from "../lib/auth";
import { createReport, reportInputSchema } from "../lib/reports";

/**
 * User-facing reporting (PROMPT 18).
 *
 * Reporting is available to every signed-in account, not just sellers, so this is
 * its own mount at `/api/reports` rather than a handler under the seller workspace.
 * The `reason`/`details`/target rules and the "exactly one target" refinement live
 * in `server/lib/reports.ts`, shared with the legacy `/api/seller/reports` entry
 * point so the two cannot drift.
 */
export const reportsRoute = new Router();

reportsRoute.post("/", guarded("reports.create", async (c) => {
  const user = requireUser(c);
  const input = reportInputSchema.parse(await c.req.json());
  const result = await createReport(user.id, input);
  return c.json(ok(result), 201);
}));
