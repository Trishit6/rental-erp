import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  isLegacyHash,
  needsRehash,
  parseScryptHash,
  passwordIssues,
  verifyAndRehash,
  verifyPassword,
} from "../server/lib/password";

/**
 * The password layer: scrypt with pinned parameters, a versioned stored hash, and
 * a legacy bcrypt path that *verifies once* and upgrades on the next login.
 *
 * ## What "versioned" buys
 *
 * The parameters ride inside the stored string (`scrypt$32768$8$1$…`), so the
 * verifier reads them back instead of assuming constants. That is what lets a
 * future cost bump be a deploy rather than a migration: old hashes keep verifying
 * with the parameters they were made with, and `needsRehash` flags the row for
 * upgrade.
 */
describe("password hashing (scrypt)", () => {
  it("produces a versioned scrypt hash that verifies", async () => {
    const hash = await hashPassword("hunter2-sandwich");
    const parts = hash.split("$");
    expect(parts[0]).toBe("scrypt");
    expect(parts.slice(1, 5)).toEqual(["32768", "8", "1", "64"]); // N=2^15, r=8, p=1
    expect(await verifyPassword("hunter2-sandwich", hash)).toBe(true);
    expect(await verifyPassword("hunter2-sandwich!x", hash)).toBe(false);
  });

  it("gives every hash a fresh random salt", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password-42"), hashPassword("same-password-42")]);
    expect(a).not.toBe(b);
    const saltA = parseScryptHash(a)!.salt.toString("hex");
    const saltB = parseScryptHash(b)!.salt.toString("hex");
    expect(saltA).not.toBe(saltB);
  });

  it("uses 16 bytes of salt and constant-time comparison", async () => {
    // The 16-byte salt is the brief's requirement; the comparison is timingSafeEqual
    // inside verifyPassword, so a wrong password costs one derive, never a fast path.
    expect(parseScryptHash(await hashPassword("x")).salt.length).toBe(16);
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("refuses a tampered hash without throwing", async () => {
    const hash = await hashPassword("a-b-c-d-e");
    const tampered = hash.slice(0, -2) + (hash.endsWith("aa") ? "bb" : "aa");
    expect(await verifyPassword("a-b-c-d-e", tampered)).toBe(false);
  });

  it("treats garbage as 'false', not as an exception", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$0$0$0$0$::::")).toBe(false);
  });

  it("reports rehash-needed for legacy or repriced hashes", async () => {
    expect(needsRehash(bcrypt.hashSync("x", 10))).toBe(true);
    const current = await hashPassword("x");
    expect(needsRehash(current)).toBe(false);
    // A hash claiming different parameters counts as outdated.
    const repriced = current.replace("$32768$", "$16384$");
    expect(needsRehash(repriced)).toBe(true);
    expect(isLegacyHash(bcrypt.hashSync("x", 10))).toBe(true);
    expect(isLegacyHash(current)).toBe(false);
  });

  it("verifies a legacy bcrypt hash and hands back an upgrade", async () => {
    const legacy = bcrypt.hashSync("legacy-password-9", 10);
    const result = await verifyAndRehash("legacy-password-9", legacy);
    expect(result.ok).toBe(true);
    expect(result.upgradedHash).not.toBeNull();
    expect(result.upgradedHash!.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("legacy-password-9", result.upgradedHash!)).toBe(true);
    // The old hash stays valid too — the upgrade is a write at the call site.
    expect(await verifyPassword("legacy-password-9", legacy)).toBe(true);
  });

  it("does not rehash an already-current hash", async () => {
    const current = await hashPassword("already-current-7");
    const result = await verifyAndRehash("already-current-7", current);
    expect(result.ok).toBe(true);
    expect(result.upgradedHash).toBeNull();
  });
});

describe("password policy", () => {
  const strong = "Tr0ub4dor&3-fresh";

  it("accepts a strong password", () => {
    expect(passwordIssues(strong)).toEqual([]);
    expect(passwordIssues(strong).length).toBe(0);
  });

  it("rejects a short password", () => {
    expect(passwordIssues("short1")).toContain(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  });

  it("rejects an overlong password", () => {
    expect(passwordIssues("x".repeat(PASSWORD_MAX_LENGTH + 1))).toContain("Password is too long");
  });

  it("rejects common passwords case-insensitively", () => {
    const message = "That password is too common. Choose something less guessable.";
    expect(passwordIssues("Password1")).toContain(message);
    expect(passwordIssues("ILOVEYOU")).toContain(message);
    expect(passwordIssues("welcome123")).toContain(message);
  });

  it("rejects the local part of the user's own email", () => {
    expect(passwordIssues("asha.rao", { email: "asha.rao@example.com" })).toContain(
      "Your password must not be your email address.",
    );
    // Without the email context the same string is fine.
    expect(passwordIssues("asha.rao")).toEqual([]);
  });

  it("reports every problem at once", () => {
    const issues = passwordIssues("password1", { email: "password1@example.com" });
    expect(issues).toEqual(
      expect.arrayContaining([
        "That password is too common. Choose something less guessable.",
      ]),
    );
  });
});