import { api } from "@/lib/api/client";
import type { AuthResponse, LoginPayload, LogoutResponse, RegisterPayload, User } from "./types";

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

export type { AuthResponse };
