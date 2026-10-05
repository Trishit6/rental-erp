import { api } from "@/lib/api/client";
import type {
  ChangePasswordPayload,
  ChangePasswordResponse,
  LoginPayload,
  LogoutResponse,
  ProfileUpdatePayload,
  RegisterPayload,
  User,
} from "./types";

/** POST /api/auth/login — server sets the session cookie on success. */
export async function login(payload: LoginPayload): Promise<User> {
  const { data } = await api.post<User>("/auth/login", payload);
  return data;
}

/** POST /api/auth/register — creates a USER and signs them in. */
export async function register(payload: RegisterPayload): Promise<User> {
  const { data } = await api.post<User>("/auth/register", payload);
  return data;
}

/** POST /api/auth/logout — invalidates the server session and clears the cookie. */
export async function logout(): Promise<LogoutResponse> {
  const { data } = await api.post<LogoutResponse>("/auth/logout");
  return data;
}

/** GET /api/auth/me — resolves the current session user (or 401). */
export async function getCurrentUser(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

/**
 * PATCH /api/auth/me — edit the signed-in user's own name, phone and avatar.
 *
 * ## Why the session decides the target row
 *
 * There is no user id in the path or the body. The server derives the actor from the
 * session cookie, so there is no request this function can compose that would update
 * somebody else's account — the property holds because the parameter is not
 * expressible, not because a check could be bypassed.
 *
 * The endpoint is `PATCH` rather than `PUT` because it is partial by contract: omitted
 * fields are left untouched server-side.
 */
export async function updateProfile(payload: ProfileUpdatePayload): Promise<User> {
  const { data } = await api.patch<User>("/auth/me", payload);
  return data;
}

/**
 * POST /api/auth/change-password — requires the *current* password, and revokes every
 * other session on success.
 *
 * No hash, no token and no password ever appears in the response; it carries a boolean
 * and the count of sessions signed out, which is the one thing the user needs to be told
 * and is derived server-side.
 */
export async function changePassword(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
  const { data } = await api.post<ChangePasswordResponse>("/auth/change-password", payload);
  return data;
}

export type { AuthResponse } from "./types";