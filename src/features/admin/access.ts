/**
 * The client's view of the signed-in staff member's access (PROMPT 22).
 *
 * ## Why the workspace reads this at all
 *
 * The brief asks the sidebar to show **only** the modules a user's permissions
 * allow. That is a UX decision (server enforcement is separate and authoritative —
 * `requirePermission` on every `/api/admin` route), but it is still worth doing:
 * a support agent whose rail lists "Payouts" will click it, wait, and get a 403,
 * which reads as a broken workspace rather than a boundary.
 *
 * ## Why the permission set is not derived from `user.role`
 *
 * The coarse `users.role` of every staff account is `ADMIN`. What separates a
 * SUPPORT agent from FINANCE is the role granted in `user_roles`, which only the
 * server can resolve (`GET /api/admin/me`). Anything the client computed from the
 * session's `role` would be wrong for every staff member.
 */

export type AdminAccess = {
  /** The coarse `users.role` (`ADMIN` for every staff account). */
  role: string;
  /** System role names from `user_roles`, e.g. `["SUPPORT"]`. */
  roles: string[];
  /** Permission keys `resource.action`. */
  permissions: string[];
  isSuperAdmin: boolean;
};

/**
 * Whether an access set may see a permission-gated element.
 *
 * Three cases, deliberately:
 *  - no permission on the element → always visible (the admin's own feed);
 *  - access not loaded yet → visible, so the rail does not flash empty and then
 *    refill on every load. The server refuses anything the account cannot use, so
 *    the cost of guessing "visible" for one render is a hidden-reveal, not a leak;
 *  - otherwise the grant list decides, and `SUPER_ADMIN` is unrestricted.
 */
export function hasPermission(
  access: AdminAccess | undefined,
  permission: string | undefined,
): boolean {
  if (!permission) return true;
  if (!access) return true;
  if (access.isSuperAdmin) return true;
  return access.permissions.includes(permission);
}
