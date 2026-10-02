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
  avatar: string | null;
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
