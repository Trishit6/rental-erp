/** Application roles — always use these unions, never arbitrary strings. */
export const AUTH_ROLES = ["USER", "SELLER", "ADMIN"] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

/**
 * Roles that may open the seller workspace.
 *
 * Mirrors `SELLER_ROLES` in `server/lib/seller-access.ts`. It is duplicated
 * rather than imported because the two live in different tsconfigs and the
 * client must not reach server code; `tests/seller-access.test.ts` asserts the
 * two agree, the same way the product-status vocabulary is kept honest in
 * `tests/listing-status.test.ts`.
 */
export const CLIENT_SELLER_ROLES = ["SELLER", "ADMIN"] as const;

export function isSellerRole(role: string | null | undefined): boolean {
  return !!role && (CLIENT_SELLER_ROLES as readonly string[]).includes(role);
}

export type User = {
  id: number;
  name: string;
  email: string;
  role: AuthRole;
  verified: boolean;
  /**
   * The profile picture, or `null` for "none — draw the initial".
   *
   * ## Why this is `avatarUrl` and not `avatar`
   *
   * It was typed `avatar`, which does not exist on the wire. Every other feature in the
   * app (`lib/types.ts`, `orders`, `reviews`, `messages`, `rentals`) types the same field
   * as `avatarUrl` because that is what `users.avatar_url` serialises to, so this one type
   * was the odd spelling out — and because TypeScript believed it, `site-header.tsx` read
   * `user.avatar` and always got `undefined`. The header therefore showed a fallback
   * initial for *every* user, including those with a real photo, and nothing failed
   * visibly: a `string | null` field that is simply always null.
   */
  avatarUrl: string | null;
  phone?: string | null;
  createdAt?: string;
};

export type AuthSession = {
  user: User | null;
  /** True while the initial auth state is still being resolved from the server. */
  status: "loading" | "authenticated" | "unauthenticated";
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  /** Optional on the wire — the server always assigns USER. */
  role?: AuthRole;
};

export type AuthResponse = {
  user: User;
};

export type LogoutResponse = {
  loggedOut: boolean;
};

/**
 * `POST /auth/logout-all` — every session on the account, this one included.
 *
 * `revokedSessions` is a count, not a list: the client needs it for the toast
 * ("signed out 3 devices"), and a list would be session ids it has no business
 * holding.
 */
export type LogoutAllResponse = {
  loggedOut: boolean;
  revokedSessions: number;
};

/**
 * The change-password request body.
 *
 * `newPassword` only — `confirmNewPassword` is deliberately absent. The confirmation is
 * checked in the form against what the user typed, and sending it would only give the
 * illusion of a server-side check that does not exist; `POST /auth/change-password`
 * rejects unknown keys outright.
 */
export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResponse = {
  changed: boolean;
  /** How many *other* sessions the change signed out. */
  revokedSessions: number;
};

/** The self-service profile fields, mirroring `selfEditableProfileFields` on the server. */
export type ProfileUpdatePayload = {
  name?: string;
  phone?: string;
  /** `null` clears the picture — the server's schema allows it, the old one did not. */
  avatarUrl?: string | null;
};
