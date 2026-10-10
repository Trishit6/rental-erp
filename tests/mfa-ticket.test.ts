import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { accessTokenSecret } from "../server/lib/env";
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  MFA_TICKET_AUDIENCE,
  signAccessToken,
  signMfaTicket,
  verifyAccessToken,
  verifyMfaTicket,
} from "../server/lib/jwt";

/**
 * MFA tickets: the short-lived credential minted between a correct password and a
 * correct TOTP code.
 *
 * The two token families share a signing key but NOT an audience, so a ticket can
 * never be spent as an access token or vice versa. The expiry, the audience
 * separation and the tamper refusal are the properties the login step-up depends
 * on.
 */
// Copy the key into a Uint8Array from the *current* global, exactly as the server
// does — jsdom's TextEncoder returns a foreign-realm array that jose's
// `key instanceof Uint8Array` guard refuses.
const encoded = new TextEncoder().encode(accessTokenSecret());
const key = new Uint8Array(encoded.length);
key.set(encoded);

async function expiredTicket(): Promise<string> {
  return new SignJWT({ purpose: "mfa" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("42")
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(MFA_TICKET_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("-10s")
    .sign(key);
}

describe("MFA ticket", () => {
  it("round-trips: a signed ticket verifies to its user id", async () => {
    const ticket = await signMfaTicket({ userId: 42 });
    expect(await verifyMfaTicket(ticket)).toBe(42);
  });

  it("refuses an expired ticket", async () => {
    expect(await verifyMfaTicket(await expiredTicket())).toBeNull();
  });

  it("refuses garbage and empty input", async () => {
    expect(await verifyMfaTicket("")).toBeNull();
    expect(await verifyMfaTicket("not-a-ticket")).toBeNull();
  });

  it("cross-audience: an access token is not a ticket", async () => {
    const access = await signAccessToken({ userId: 42, sessionId: "sess-1", role: "ADMIN" });
    expect(await verifyMfaTicket(access)).toBeNull();
  });

  it("cross-audience: a ticket is not an access token", async () => {
    const ticket = await signMfaTicket({ userId: 42 });
    expect(await verifyAccessToken(ticket)).toBeNull();
  });

  it("a token for another audience of the same key is refused", async () => {
    const wrongAudience = await new SignJWT({ sid: "s", role: "USER" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("1")
      .setIssuer(ACCESS_TOKEN_ISSUER)
      // The web audience — a mobile client in the same deployment, say.
      .setAudience(`${ACCESS_TOKEN_AUDIENCE}-mobile`)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    expect(await verifyAccessToken(wrongAudience)).toBeNull();
  });
});