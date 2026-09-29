/** Application roles — always use these unions, never arbitrary strings. */
export const AUTH_ROLES = ["USER", "SELLER", "ADMIN"] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

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
