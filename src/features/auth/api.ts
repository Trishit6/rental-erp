import { api, resetRefreshState } from "@/lib/api/client";
import type {
  ChangePasswordPayload,
  ChangePasswordResponse,
  ForgotPasswordPayload,
  ForgotPasswordResult,
  LoginPayload,
  LoginResult,
  LogoutAllResponse,
  LogoutResponse,
  MfaChallengePayload,
  MfaDisableResult,
  MfaRecoveryCodesResult,
  MfaSetupResult,
  MfaStatus,
  MfaVerifyResult,
  ProfileUpdatePayload,
  RegisterPayload,
  ResetPasswordPayload,
  ResetPasswordResult,
  SessionInfo,
  User,
} from "./types";

/**
 * POST /api/auth/login — server sets the session cookies on success, or answers
 * `{ mfaRequired: true, ticket }` when the account has a second factor (see
 * `LoginResult`). The refresh latch is only re-armed when a *session* actually
 * exists — a password that still needs a second factor has not authenticated yet.
 */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  const { data } = await api.post<LoginResult>("/auth/login", payload);
  if (!("mfaRequired" in data)) resetRefreshState();
  return data;
}

/** POST /api/auth/register — creates a USER and signs them in. */
export async function register(payload: RegisterPayload): Promise<User> {
  const { data } = await api.post<User>("/auth/register", payload);
  resetRefreshState();
  return data;
}

/** POST /api/auth/logout — revokes the server session and clears the cookies. */
export async function logout(): Promise<LogoutResponse> {
  const { data } = await api.post<LogoutResponse>("/auth/logout");
  resetRefreshState();
  return data;
}

/**
 * POST /api/auth/logout-all — revoke every session on the account, including
 * this one, and clear the cookies.
 *
 * The response carries how many sessions were ended. It carries no token, no
 * session id and no user id: everything needed to act on it has already happened
 * server-side by the time the client reads it.
 */
export async function logoutAll(): Promise<LogoutAllResponse> {
  const { data } = await api.post<LogoutAllResponse>("/auth/logout-all");
  resetRefreshState();
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

/* ----------------------------------- MFA ---------------------------------- */

/**
 * POST /api/auth/mfa/challenge — spend a ticket with a valid TOTP or unused
 * recovery code. This is the moment the session is actually issued.
 */
export async function completeMfaChallenge(payload: MfaChallengePayload): Promise<User> {
  const { data } = await api.post<User>("/auth/mfa/challenge", payload);
  resetRefreshState();
  return data;
}

/** GET /api/auth/mfa/status — whether the account has a second factor. */
export async function getMfaStatus(): Promise<MfaStatus> {
  const { data } = await api.get<MfaStatus>("/auth/mfa/status");
  return data;
}

/**
 * POST /api/auth/mfa/setup — begin enrolment. The secret and otpauth URL come
 * back exactly once, to the browser that asked; it is never logged and never
 * stored in plaintext.
 */
export async function startMfaSetup(): Promise<MfaSetupResult> {
  const { data } = await api.post<MfaSetupResult>("/auth/mfa/setup");
  return data;
}

/** POST /api/auth/mfa/verify — confirm enrolment with the first live code. */
export async function verifyMfaSetup(code: string): Promise<MfaVerifyResult> {
  const { data } = await api.post<MfaVerifyResult>("/auth/mfa/verify", { code });
  return data;
}

/** POST /api/auth/mfa/disable — requires the password *and* a current code. */
export async function disableMfa(payload: { password: string; code: string }): Promise<MfaDisableResult> {
  const { data } = await api.post<MfaDisableResult>("/auth/mfa/disable", payload);
  return data;
}

/** POST /api/auth/mfa/recovery-codes — regenerate, returning them exactly once. */
export async function regenerateRecoveryCodes(password: string): Promise<MfaRecoveryCodesResult> {
  const { data } = await api.post<MfaRecoveryCodesResult>("/auth/mfa/recovery-codes", { password });
  return data;
}

/* ------------------------------- my sessions ------------------------------- */

/** GET /api/auth/sessions — the signed-in user's live sessions, newest first. */
export async function getSessions(): Promise<SessionInfo[]> {
  const { data } = await api.get<SessionInfo[]>("/auth/sessions");
  return data;
}

/** DELETE /api/auth/sessions/:id — end one of my own sessions. */
export async function revokeSession(sessionId: string): Promise<{ revoked: boolean }> {
  const { data } = await api.delete<{ revoked: boolean }>(`/auth/sessions/${sessionId}`);
  return data;
}

/* ------------------------------ password reset ----------------------------- */

/**
 * POST /api/auth/forgot-password.
 *
 * Always answers `{ sent: true }`, whether or not the address exists — the
 * server's no-enumeration rule. The UI says the same thing regardless.
 */
export async function forgotPassword(payload: ForgotPasswordPayload): Promise<ForgotPasswordResult> {
  const { data } = await api.post<ForgotPasswordResult>("/auth/forgot-password", payload);
  return data;
}

/**
 * POST /api/auth/reset-password — spend the emailed token, set a new password,
 * end every session. The token is single-use and expiring.
 */
export async function resetPassword(payload: ResetPasswordPayload): Promise<ResetPasswordResult> {
  const { data } = await api.post<ResetPasswordResult>("/auth/reset-password", payload);
  return data;
}

export type { AuthResponse } from "./types";