import { describe, expect, it } from "vitest";
import { mfaEncryptionKey } from "../server/lib/env";
import {
  decryptSecret,
  encryptSecret,
  encryptSecretWith,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from "../server/lib/mfa";

/**
 * MFA secret storage and recovery codes.
 *
 * The TOTP secret is encrypted with AES-256-GCM under `MFA_ENCRYPTION_KEY` before
 * it touches the database; the tests here prove the round trip, the tamper
 * refusal, the deterministic-IV path the seeders use, and the recovery-code hash
 * discipline (hashed at rest, constant-time compare, tolerant of casing).
 */
describe("MFA secret encryption", () => {
  it("round-trips a secret through encrypt → decrypt", () => {
    const secret = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("uses random IVs, so two encryptions of the same secret differ", () => {
    const a = encryptSecret("same-secret");
    const b = encryptSecret("same-secret");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-secret");
    expect(decryptSecret(b)).toBe("same-secret");
  });

  it("is deterministic when the IV is supplied (the seeder path)", () => {
    const iv = Buffer.from("0123456789ab", "utf8");
    const a = encryptSecretWith("seeded-secret", iv);
    const b = encryptSecretWith("seeded-secret", iv);
    expect(a).toBe(b);
    // A different IV for the same key/plaintext changes the ciphertext.
    expect(encryptSecretWith("seeded-secret", Buffer.from("abcdefghijkl", "utf8"))).not.toBe(a);
    expect(decryptSecret(a)).toBe("seeded-secret");
  });

  it("requires a 12-byte IV", () => {
    expect(() => encryptSecretWith("x", Buffer.from("tooshort"))).toThrow();
  });

  it("refuses tampered ciphertext", () => {
    const envelope = encryptSecret("precious");
    // Flip one character inside the ciphertext part (after the third colon).
    const parts = envelope.split(":");
    const cipher = parts[3]!;
    const flipped = cipher.length > 4 ? `${"A" === cipher[0] ? "B" : "A"}${cipher.slice(1)}` : cipher;
    const tampered = [...parts.slice(0, 3), flipped].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("refuses a wrong key", () => {
    const envelope = encryptSecret("under-key-a");
    const original = process.env.MFA_ENCRYPTION_KEY;
    process.env.MFA_ENCRYPTION_KEY = "ff".repeat(32); // different 32 bytes
    try {
      expect(() => decryptSecret(envelope)).toThrow();
    } finally {
      if (original === undefined) delete process.env.MFA_ENCRYPTION_KEY;
      else process.env.MFA_ENCRYPTION_KEY = original;
    }
  });
});

describe("MFA_ENCRYPTION_KEY validation", () => {
  it("accepts base64 and hex forms of exactly 32 bytes", () => {
    const original = process.env.MFA_ENCRYPTION_KEY;
    try {
      process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
      expect(mfaEncryptionKey().length).toBe(32);
      process.env.MFA_ENCRYPTION_KEY = "ab".repeat(32);
      expect(mfaEncryptionKey().length).toBe(32);
    } finally {
      if (original === undefined) delete process.env.MFA_ENCRYPTION_KEY;
      else process.env.MFA_ENCRYPTION_KEY = original;
    }
  });

  it("refuses a missing, short or malformed key", () => {
    const original = process.env.MFA_ENCRYPTION_KEY;
    try {
      delete process.env.MFA_ENCRYPTION_KEY;
      expect(() => mfaEncryptionKey()).toThrow(/MFA_ENCRYPTION_KEY/);
      process.env.MFA_ENCRYPTION_KEY = "ab"; // 1 byte as hex
      expect(() => mfaEncryptionKey()).toThrow();
      process.env.MFA_ENCRYPTION_KEY = "!!!!"; // decodes to 0 bytes
      expect(() => mfaEncryptionKey()).toThrow();
    } finally {
      if (original === undefined) delete process.env.MFA_ENCRYPTION_KEY;
      else process.env.MFA_ENCRYPTION_KEY = original;
    }
  });
});

describe("recovery codes", () => {
  it("hashes at rest and verifies in constant time", () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(verifyRecoveryCode(code, hashRecoveryCode(code))).toBe(true);
    }
  });

  it("is forgiving about how the user typed the code", () => {
    const code = "ABCD-EFGH";
    const stored = hashRecoveryCode(code);
    expect(verifyRecoveryCode("abcd-efgh", stored)).toBe(true);
    expect(verifyRecoveryCode("ABCDEFGH", stored)).toBe(true);
    expect(verifyRecoveryCode(" abcd-efgh ", stored)).toBe(true);
  });

  it("rejects a wrong or re-cased-by-content code", () => {
    const stored = hashRecoveryCode("WXYZ-2345");
    expect(verifyRecoveryCode("WXYZ-2346", stored)).toBe(false);
    expect(verifyRecoveryCode("", stored)).toBe(false);
  });
});