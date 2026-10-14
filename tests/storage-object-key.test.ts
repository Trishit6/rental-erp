import { describe, expect, it } from "vitest";
import { buildObjectKey, objectKeyFromUrl, ownsObjectKey } from "../server/lib/storage/types";

/**
 * Object keys are a security boundary: they are validated on both mint and delete,
 * and the random segment is what keeps one seller from guessing another's object
 * path. `Math.random` is not a cryptographic source, so `buildObjectKey` uses
 * `crypto.randomBytes` — this pins both the shape and the absence of collisions.
 */
describe("storage object keys", () => {
  it("mints unique, well-formed keys", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      keys.add(buildObjectKey("products", 7, "image/jpeg"));
    }

    expect(keys.size).toBe(500);
    for (const key of keys) {
      expect(key).toMatch(/^products\/7\/[a-z0-9]{8,32}\.jpg$/);
      expect(ownsObjectKey(key, "products", 7)).toBe(true);
    }
  });

  it("does not belong to a different owner or scope", () => {
    const key = buildObjectKey("products", 7, "image/png");
    expect(ownsObjectKey(key, "products", 8)).toBe(false);
    expect(ownsObjectKey(key, "avatars", 7)).toBe(false);
  });

  it("round-trips through objectKeyFromUrl", () => {
    const key = buildObjectKey("products", 42, "image/webp");
    expect(objectKeyFromUrl(`https://cdn.example.com/${key}`)).toBe(key);
    expect(objectKeyFromUrl("https://cdn.example.com/not-ours/thing.png")).toBeNull();
  });
});
