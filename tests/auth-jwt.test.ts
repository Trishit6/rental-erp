import { describe, expect, it } from "vitest";
import { SignJWT, decodeJwt } from "jose";
import { accessTokenSecret } from "../server/lib/env";
import { ACCESS_TOKEN_ISSUER, signAccessToken, verifyAccessToken } from "../server/lib/jwt";

/**
 * The access token's contents and its refusals.
 *
 * ## What is actually at stake
 *
 * A JWT is a bearer credential that travels to every endpoint the browser
 * touches, so two properties have to hold and neither is visible from a type:
 *
 *  1. **The payload is minimal.** Anything in it is copied to every request and
 *     is readable by whoever holds the token. An email, a name or — worst —
 *     anything password-derived would be a disclosure that no endpoint asked
 *     for, because the server loads the real row from MariaDB on every request
 *     anyway.
 *  2. **Only this deployment's tokens verify.** The failure modes are not
 *     symmetric: a token signed with another secret, an expired one, a tampered
 *     one and a structurally-valid-but-sidless one must *all* be refused, and
 *     the caller must not be able to tell which happened.
 */

const issued = signAccessToken({ userId: 42, sessionId: "s3ss10n", role: "ADMIN" });

/**
 * A signing key jose will accept, built from this realm's `Uint8Array`.
 *
 * `TextEncoder` alone returns bytes from its own realm, which the jsdom test
 * environment's `instanceof` check inside jose then refuses — the same quirk the
 * copy inside `server/lib/jwt.ts` exists to sidestep. Tests sign with their own
 * keys here, so they mirror that copy.
 */
const key = (secret: string): Uint8Array => new Uint8Array(new TextEncoder().encode(secret));

describe("an access token carries identity, session and time — nothing else", () => {
  it("round-trips the claims the server signed", async () => {
    const payload = await verifyAccessToken(await issued);

    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("42");
    expect(payload?.sid).toBe("s3ss10n");
    expect(payload?.role).toBe("ADMIN");
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("contains no email, name, password or other private claim", async () => {
    // Decoded rather than verified here: the point is what is *in* it, and a
    // successful decode of our own token proves the assertion is about the real
    // payload rather than about an empty one nobody would have shipped.
    const payload = decodeJwt(await issued);

    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "iss", "role", "sid", "sub"]);
    expect(JSON.stringify(payload)).not.toMatch(/password|email|@|hash/i);
  });

  it("uses `sub` for the user id, as a string", async () => {
    const payload = decodeJwt(await issued);
    expect(typeof payload.sub).toBe("string");
    expect(payload.sub).toBe("42");
  });
});

describe("a token this deployment did not sign never verifies", () => {
  it("rejects one signed with a different secret", async () => {
    const foreign = await new SignJWT({ sid: "s3ss10n", role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(key("a-different-secret-that-is-long-enough-0123456789"));

    expect(await verifyAccessToken(foreign)).toBeNull();
  });

  it("rejects an expired token", async () => {
    // The shape of a tab left open past fifteen minutes. `null` — not a throw —
    // because the caller treats every unusable token identically: no session.
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ sid: "s3ss10n", role: "USER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 60)
      .sign(key(accessTokenSecret()));

    expect(await verifyAccessToken(expired)).toBeNull();
  });

  it("rejects a payload edited after signing", async () => {
    // Signature covers the payload, so rewriting an identity claim invalidates
    // it. The three-segment splice is exactly how an attacker would attempt it —
    // here repointing the token at a different account.
    const token = await issued;
    const [header, payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    claims.sub = "1";
    const forged = [
      header,
      Buffer.from(JSON.stringify(claims)).toString("base64url"),
      signature,
    ].join(".");

    expect(await verifyAccessToken(forged)).toBeNull();
  });

  it("rejects a correctly signed token that names no session", async () => {
    // The structural case: valid signature, valid issuer, but no `sid` — so there
    // is no session row to revoke and no way to honour a sign-out. Refusing it is
    // what makes `sid` a requirement rather than a convention.
    const sidless = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(key(accessTokenSecret()));

    expect(await verifyAccessToken(sidless)).toBeNull();
  });

  it("rejects a string that is not a token at all", async () => {
    expect(await verifyAccessToken("not.a.jwt")).toBeNull();
    expect(await verifyAccessToken("")).toBeNull();
  });

  it("refuses to sign when the secret is missing, rather than using a default", async () => {
    const previous = process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    try {
      await expect(signAccessToken({ userId: 1, sessionId: "s", role: "USER" })).rejects.toThrow(
        /JWT_ACCESS_SECRET/,
      );
    } finally {
      process.env.JWT_ACCESS_SECRET = previous;
    }
  });
});
