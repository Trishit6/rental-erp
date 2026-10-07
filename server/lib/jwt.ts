/**
 * Access tokens: short-lived JWTs, signed with HMAC-SHA256.
 *
 * ## What this is for, and what it is not
 *
 * The token is a *bearer of an identity*, nothing more. Its whole payload is the
 * user id, the session id it was minted for, and the role the account had at
 * that moment — no email, no name, no profile, and above all no password or
 * anything derived from one. Every one of those is a field the token would carry
 * to every endpoint it is presented to, for no gain: the server loads the real
 * row from MariaDB on every request anyway (`attachUser`), which is what makes a
 * role change or a deleted account take effect immediately instead of at the next
 * token renewal.
 *
 * ## Why the session id matters more than the user id
 *
 * `sub` alone would make a stolen token unrevocable: the account would still be
 * valid, so the only response would be to change the password and hope. `sid`
 * ties the token to one row in `sessions`, so "sign out this device" and "this
 * refresh token was replayed, kill the session" both work — the JWT stops being
 * a fact about the account and becomes a reference to a record the server can
 * delete.
 *
 * ## Why HMAC rather than a public-key scheme
 *
 * One service signs and the same service verifies, so the extra key material and
 * certificate handling of RS256 would buy interoperability this app does not
 * have. HS256 with a per-deployment random secret is the standard answer for
 * that shape, and it keeps verification to a single constant-time MAC compare.
 */

import { SignJWT, jwtVerify } from "jose";
import { accessTokenSecret, ACCESS_TOKEN_TTL_SECONDS } from "./env";

/** Who issues these tokens. Verified on the way in so a foreign token is refused. */
export const ACCESS_TOKEN_ISSUER = "revaro";

/**
 * The whole payload, by design.
 *
 * `sub` is authoritative for *who*; `sid` is authoritative for *which session*.
 * `role` rides along for symmetry with the example payload and for anyone reading
 * a decoded token in a log or a debugger — it is never trusted for authorization:
 * `requireAdmin` reads the role off the row the session points at.
 */
export type AccessTokenClaims = {
  /** User id, as a string because JWT reserves `sub` for a string subject. */
  sub: string;
  /** Session id — the `sessions.id` this token is bound to. */
  sid: string;
  role: string;
  iat: number;
  exp: number;
};

export type AccessTokenInput = {
  userId: number;
  sessionId: string;
  role: string;
};

/**
 * The signing secret as bytes the verifier will accept.
 *
 * `TextEncoder` hands back a byte array belonging to whichever realm implemented
 * it. In the test environment (jsdom) that is not the realm whose `Uint8Array`
 * jose compares against, so a key straight from `TextEncoder` is refused by
 * `key instanceof Uint8Array` despite being one. Copying into an array built
 * from the current global makes the key belong to the realm that will inspect
 * it; under Node — the only place this runs for real — the two coincide and the
 * copy is one `memcpy`.
 */
function secretKey(): Uint8Array {
  const encoded = new TextEncoder().encode(accessTokenSecret());
  const key = new Uint8Array(encoded.length);
  key.set(encoded);
  return key;
}

/** Mint an access token for a freshly created (or refreshed) session. */
export async function signAccessToken(input: AccessTokenInput): Promise<string> {
  return new SignJWT({ sid: input.sessionId, role: input.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(input.userId))
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

/**
 * Verify a token and return its claims, or `null` for anything unusable.
 *
 * Returns `null` rather than throwing because *most* failures are the ordinary
 * case — an expired token on a page the user left open, a cookie from a previous
 * deployment — and the caller (`attachUser`) treats every one of them the same
 * way: no session, fall through to `requireUser`'s 401. The one distinction worth
 * keeping is the *reason*, which jose already distinguishes; it is collapsed here
 * deliberately so no code path can accidentally branch on "expired but otherwise
 * valid" and accept a token it should refuse.
 *
 * `clockTolerance` absorbs the skew between the machine that signed the token and
 * the one verifying it, so a request in flight as the token crosses its expiry is
 * not failed by a millisecond of drift.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ACCESS_TOKEN_ISSUER,
      algorithms: ["HS256"],
      clockTolerance: 5,
    });

    const { sub, sid, role, iat, exp } = payload;
    if (
      typeof sub !== "string" ||
      typeof sid !== "string" ||
      typeof role !== "string" ||
      typeof iat !== "number" ||
      typeof exp !== "number"
    ) {
      // Structurally valid signature, semantically unusable payload. Refusing it
      // is the same answer as a bad signature: the caller has no session.
      return null;
    }
    return { sub, sid, role, iat, exp };
  } catch {
    // Expired, tampered, unsigned with another secret, or not a JWT at all.
    // Logged nowhere on purpose: the token itself is the credential, and writing
    // it (or a fragment of it) to a log is how "never log the JWT" gets broken.
    return null;
  }
}
