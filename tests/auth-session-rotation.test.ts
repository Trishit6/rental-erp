import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  LEGACY_SESSION_COOKIE,
  accessTokenCookieOptions,
  classifyRefreshToken,
  hashRefreshToken,
  refreshTokenCookieOptions,
} from "../server/lib/auth";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "../server/lib/env";

/**
 * Session credentials: how they are stored, how they are wrapped, and what a
 * presented token is taken to mean.
 *
 * These are the three assertions that cannot be made from a running app without
 * a browser and a database, and the three an attacker would be looking for:
 * that the database never holds the raw token, that JavaScript never gets the
 * cookie, and that replaying a rotated token kills the session instead of
 * quietly working.
 */

const originalNodeEnv = process.env.NODE_ENV;
const originalSecureFlag = process.env.AUTH_COOKIE_SECURE;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalSecureFlag === undefined) delete process.env.AUTH_COOKIE_SECURE;
  else process.env.AUTH_COOKIE_SECURE = originalSecureFlag;
});

describe("stored refresh tokens", () => {
  it("are a SHA-256 of the raw value, not the value", () => {
    const raw = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    expect(hashRefreshToken(raw)).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(hashRefreshToken(raw)).not.toContain(raw);
  });

  it("are 64 hex characters — the column's exact width", () => {
    // A hash that outgrew `varchar(64)` would fail on insert, i.e. at the moment
    // somebody tries to sign in.
    expect(hashRefreshToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differ for different tokens", () => {
    // Otherwise lookup-by-hash would resolve a stranger's cookie to this session.
    expect(hashRefreshToken("token-a")).not.toBe(hashRefreshToken("token-b"));
  });
});

describe("auth cookies", () => {
  it("are HttpOnly, SameSite=Lax and path=/", () => {
    for (const options of [accessTokenCookieOptions(), refreshTokenCookieOptions()]) {
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe("Lax");
      expect(options.path).toBe("/");
    }
  });

  it("expire with the credential they carry", () => {
    expect(accessTokenCookieOptions().maxAge).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(refreshTokenCookieOptions().maxAge).toBe(REFRESH_TOKEN_TTL_SECONDS);
    // The refresh cookie is the one that defines how long the device stays
    // signed in, so it must outlive the access token by more than a rounding error.
    expect(refreshTokenCookieOptions().maxAge!).toBeGreaterThan(accessTokenCookieOptions().maxAge!);
  });

  it("are not Secure in development, where the app runs on plain HTTP", () => {
    // A Secure cookie on http://localhost is dropped by the browser without a
    // word, and the symptom is "sign-in does nothing".
    process.env.NODE_ENV = "development";
    delete process.env.AUTH_COOKIE_SECURE;
    expect(accessTokenCookieOptions().secure).toBe(false);
    expect(refreshTokenCookieOptions().secure).toBe(false);
  });

  it("are Secure in production", () => {
    process.env.NODE_ENV = "production";
    expect(accessTokenCookieOptions().secure).toBe(true);
    expect(refreshTokenCookieOptions().secure).toBe(true);
  });

  it("can be forced Secure in development, but never insecure in production", () => {
    process.env.NODE_ENV = "development";
    process.env.AUTH_COOKIE_SECURE = "true";
    expect(accessTokenCookieOptions().secure).toBe(true);

    // The override is one-directional on purpose: a deployment that sets
    // AUTH_COOKIE_SECURE=false in production must not be able to strip the flag
    // off the credential cookies.
    process.env.NODE_ENV = "production";
    process.env.AUTH_COOKIE_SECURE = "false";
    expect(accessTokenCookieOptions().secure).toBe(true);
  });

  it("names every cookie this API has ever set, so logout can clear them all", () => {
    // The legacy name is in the list because a browser that signed in before the
    // JWT migration still holds it — a logout that left it behind would mean the
    // "signed out" state is only true for two of the three cookies.
    expect([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, LEGACY_SESSION_COOKIE]).toEqual([
      "revaro_access_token",
      "revaro_refresh_token",
      "revaro_session",
    ]);
  });
});

describe("what a presented refresh token means", () => {
  const now = new Date("2026-10-06T12:00:00.000Z");
  const current = "current-hash";
  const previous = "previous-hash";
  const future = new Date(now.getTime() + 86_400_000);

  const decide = (overrides: Partial<Parameters<typeof classifyRefreshToken>[0]>) =>
    classifyRefreshToken({
      presentedHash: current,
      currentHash: current,
      previousHash: previous,
      revokedAt: null,
      expiresAt: future,
      rotatedAt: now,
      now,
      ...overrides,
    });

  it("rotates the session's own token", () => {
    expect(decide({})).toBe("rotate");
  });

  it("rotates again when the previous token arrives within the grace window", () => {
    // Two tabs of one browser share a cookie jar, so an expiring access token
    // wakes both and both refresh before either response lands. Without this the
    // second request would be read as a replay and the user would be signed out
    // of every device for having two tabs open.
    expect(decide({ presentedHash: previous, rotatedAt: new Date(now.getTime() - 5_000) })).toBe(
      "grace",
    );
  });

  it("calls a replay after the grace window a reuse, to be revoked", () => {
    expect(
      decide({
        presentedHash: previous,
        rotatedAt: new Date(now.getTime() - 10 * 60_000),
      }),
    ).toBe("reuse");
  });

  it("refuses an already-revoked session's token", () => {
    // Before the reuse check, so a revoked session cannot be resurrected by
    // presenting its *current* token.
    expect(decide({ revokedAt: new Date(now.getTime() - 1_000) })).toBe("reject");
  });

  it("refuses a session whose expiry has passed", () => {
    expect(decide({ expiresAt: new Date(now.getTime() - 1) })).toBe("reject");
  });

  it("refuses a token belonging to no session at all", () => {
    // An orphaned or two-generations-old cookie. Refused without revoking
    // anything: an unknown token is not evidence that the real one leaked.
    expect(decide({ presentedHash: "unrelated", currentHash: null, previousHash: null })).toBe(
      "reject",
    );
  });
});
