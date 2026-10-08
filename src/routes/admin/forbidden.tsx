import { createFileRoute } from "@tanstack/react-router";
import { AdminForbiddenState } from "@/features/admin";

/**
 * `/admin/forbidden` — the 403 page for a signed-in non-admin.
 *
 * ## Why this path is special
 *
 * The layout's `requireAdmin` redirects any authenticated non-admin away from the
 * workspace — except exactly here. `requireAdmin` exempts this one path so the
 * refusal can *render* ("you don't have permission") rather than becoming a
 * redirect loop, and `AdminLayout` renders it without the sidebar or topbar so the
 * person it refuses never sees the chrome it refused them.
 *
 * An administrator visiting the path sees the same page — it describes a state they
 * are not in, and that is fine: nothing here leaks, and the two buttons lead back
 * into the app.
 */
export const Route = createFileRoute("/admin/forbidden")({
  component: AdminForbiddenState,
});