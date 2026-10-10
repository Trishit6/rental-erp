import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotp,
  generateTotpSecret,
  hotp,
  verifyTotp,
} from "../server/lib/totp";

/**
 * The TOTP implementation, pinned to the RFC 6238 test vectors.
 *
 * The vectors in RFC 6238 (Appendix B) are 8-digit SHA-1 codes. The app runs with
 * 6 digits and a `window` of 1 step of drift, both asserted here — the drift
 * tolerance is a security property (it triples the valid window) so the tests
 * prove it is exactly one step, not two.
 */
const RFC_SECRET = "12345678901234567890"; // ASCII bytes = the vector secret
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32", () => {
  it("round-trips arbitrary bytes without padding", () => {
    for (const length of [1, 5, 16, 20, 64]) {
      const bytes = randomBytes(length);
      expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    }
  });

  it("matches the RFC 4648 reference vector", () => {
    // RFC 4648 §10 test vector, omitting padding.
    expect(base32Encode(Buffer.from("foobar", "utf8"))).toBe("MZXW6YTBOI");
  });

  it("tolerates lower-case, spaces and padding when decoding", () => {
    expect(base32Decode("gezdgnbv gy3tqojqgezdgnbv gy3tqojq=")).toEqual(
      Buffer.from(RFC_SECRET, "utf8"),
    );
  });

  it("refuses characters outside the alphabet", () => {
    expect(() => base32Decode("GEZDGNBV0Y3TQOJQ")).toThrow();
  });
});

describe("HOTP (RFC 4226 vectors, SHA-1)", () => {
  it("matches the published counter table", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => {
      expect(hotp(RFC_SECRET_B32, counter)).toBe(code);
    });
  });
});

describe("TOTP (RFC 6238 vectors, SHA-1, 8 digits)", () => {
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  it.each(vectors)("time %i -> %s", (unixSeconds, expected) => {
    expect(generateTotp(RFC_SECRET_B32, { unixSeconds, digits: 8 })).toBe(expected);
  });
});

describe("verification window and replay", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;

  it("accepts the current code", () => {
    const code = generateTotp(secret, { now });
    const result = verifyTotp(secret, code, { now });
    expect(result.valid).toBe(true);
    expect(result.counter).toBe(Math.floor(now / 1000 / 30));
  });

  it("accepts one step of drift, refuses two", () => {
    const currentStepStart = Math.floor(now / 1000 / 30) * 30 * 1000;
    const twoStepsAgo = currentStepStart - 60 * 1000;
    const twoAhead = currentStepStart + 60 * 1000;
    expect(verifyTotp(secret, generateTotp(secret, { now: currentStepStart - 30_000 }), { now }).valid).toBe(true);
    expect(verifyTotp(secret, generateTotp(secret, { now: currentStepStart + 30_000 }), { now }).valid).toBe(true);
    expect(verifyTotp(secret, generateTotp(secret, { now: twoStepsAgo }), { now }).valid).toBe(false);
    expect(verifyTotp(secret, generateTotp(secret, { now: twoAhead }), { now }).valid).toBe(false);
  });

  it("reports the step it matched, for replay suppression", () => {
    // Two verifications of the same code within its window match the same step;
    // the caller stores `stepStartedAt` and rejects a second match at or before it.
    const code = generateTotp(secret, { now });
    const first = verifyTotp(secret, code, { now });
    const second = verifyTotp(secret, code, { now });
    expect(first.valid).toBe(true);
    expect(second.valid).toBe(true);
    expect(second.counter).toBe(first.counter);
    expect(second.stepStartedAt).toBe(first.stepStartedAt);
  });

  it("rejects malformed tokens without deriving anything", () => {
    expect(verifyTotp(secret, "12345", { now }).valid).toBe(false); // too short
    expect(verifyTotp(secret, "1234567", { now }).valid).toBe(false); // too long
    expect(verifyTotp(secret, "12a456", { now }).valid).toBe(false); // non-digit
    expect(verifyTotp(secret, "", { now }).valid).toBe(false);
  });
});

describe("otpauth URIs", () => {
  it("encodes the issuer, account and parameters", () => {
    const uri = buildOtpauthUrl({ secret: RFC_SECRET_B32, account: "buyer@revaro.local", issuer: "Revaro" });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(uri).toContain("issuer=Revaro");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});