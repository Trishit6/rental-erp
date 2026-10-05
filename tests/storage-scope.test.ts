import { describe, expect, it } from "vitest";
import {
  buildObjectKey,
  isStorageScope,
  isValidObjectKey,
  objectKeyPrefix,
  ownsObjectKey,
  scopeOfObjectKey,
  STORAGE_SCOPES,
} from "../server/lib/storage/types";
import { objectKeyFromUrl } from "../src/lib/storage";

/**
 * Object-key ownership, now that avatars exist alongside listing photography.
 *
 * ## Why a second scope is worth testing on its own
 *
 * The key shape *is* the security boundary: it is the only thing standing between a caller
 * and someone else's object, because both the dev upload sink and the delete endpoint are
 * handed an arbitrary client-supplied key and asked "is this yours?". Widening the key
 * pattern to cover `avatars/` is therefore a change to an authorization check, not to a
 * naming convention — and the checks it now has to satisfy are the same two that already
 * applied to `products/`, plus the new possibility of the two scopes disagreeing.
 *
 * The failure this file is shaped around: a check written for one scope and reused
 * verbatim for the other. `ownsObjectKey` takes the scope from the *key* rather than from
 * the caller, precisely so a delete request cannot ask to be checked against the prefix
 * that would make it pass.
 */

describe("a minted key is well-formed and names its owner", () => {
  it.each(STORAGE_SCOPES)("mints a %s key under the caller's own prefix", (scope) => {
    const key = buildObjectKey(scope, 7, "image/png");

    expect(key.startsWith(`${scope}/7/`)).toBe(true);
    expect(isValidObjectKey(key)).toBe(true);
    expect(scopeOfObjectKey(key)).toBe(scope);
  });

  it("derives the extension from the MIME type, never from a filename", () => {
    // The whole point of the mapping is that the stored name cannot lie about its bytes.
    expect(buildObjectKey("avatars", 7, "image/avif")).toMatch(/\.avif$/);
    expect(buildObjectKey("products", 7, "image/jpeg")).toMatch(/\.jpg$/);
  });

  it("gives two uploads of the same file different keys", () => {
    // A seller-chosen name would let one user probe another's objects, and two uploads of
    // `photo.jpg` would overwrite each other.
    expect(buildObjectKey("avatars", 7, "image/png")).not.toBe(
      buildObjectKey("avatars", 7, "image/png"),
    );
  });
});

describe("ownership", () => {
  const avatar = buildObjectKey("avatars", 7, "image/png");
  const product = buildObjectKey("products", 7, "image/png");

  it("accepts the caller's own key in either scope", () => {
    expect(ownsObjectKey(avatar, "avatars", 7)).toBe(true);
    expect(ownsObjectKey(product, "products", 7)).toBe(true);
  });

  it("refuses another user's key even when it is a valid key", () => {
    // This is the property the prefix exists for. `isValidObjectKey` alone would accept
    // both of these — they are real, well-formed keys — so a check that stopped at the
    // pattern would let user 7 delete user 8's avatar.
    expect(ownsObjectKey(avatar, "avatars", 8)).toBe(false);
    expect(ownsObjectKey(product, "products", 8)).toBe(false);
  });

  it("refuses a key from the wrong scope even for the same user", () => {
    // User 7 asking to delete `avatars/7/…` while claiming the `products` scope. Reading
    // the scope from the caller instead of from the key would make this pass.
    expect(ownsObjectKey(avatar, "products", 7)).toBe(false);
    expect(ownsObjectKey(product, "avatars", 7)).toBe(false);
  });

  it("refuses keys that try to climb out of their prefix", () => {
    const traversal = [
      "avatars/7/../../products/8/abcdefgh.jpg",
      "../avatars/7/abcdefgh.jpg",
      "/avatars/7/abcdefgh.jpg",
      "avatars//7/abcdefgh.jpg",
      "avatars/7/",
    ];
    for (const key of traversal) {
      expect(isValidObjectKey(key), key).toBe(false);
      expect(ownsObjectKey(key, "avatars", 7), key).toBe(false);
    }
  });

  it("refuses an unrecognised scope outright", () => {
    expect(isStorageScope("secrets")).toBe(false);
    expect(isStorageScope("../avatars")).toBe(false);
    expect(isStorageScope(undefined)).toBe(false);
    // Nothing can produce this key, because the mint path validates the scope first.
    expect(isValidObjectKey("secrets/7/abcdefgh.jpg")).toBe(false);
    expect(scopeOfObjectKey("secrets/7/abcdefgh.jpg")).toBeNull();
  });

  it("reports no scope for something that is not a key", () => {
    expect(scopeOfObjectKey("")).toBeNull();
    expect(scopeOfObjectKey("/api/storage/local")).toBeNull();
  });
});

describe("the client reads keys back the same way", () => {
  it("recognises an avatar url, not only a product one", () => {
    // A copy of the pattern that listed only `products/` would return null for every
    // avatar, so replacing a profile picture would orphan the old file instead of
    // removing it — silently, and only for the one scope nobody tested.
    const key = buildObjectKey("avatars", 7, "image/png");
    expect(objectKeyFromUrl(`https://cdn.example.com/storage/${key}`)).toBe(key);
  });

  it("still recognises product urls", () => {
    const key = buildObjectKey("products", 7, "image/jpeg");
    expect(objectKeyFromUrl(`/api/storage/local?key=${key}`)).toBe(key);
  });

  it("returns null for a url that is not one of ours", () => {
    expect(objectKeyFromUrl("https://example.com/avatar.png")).toBeNull();
    expect(objectKeyFromUrl("")).toBeNull();
  });
});

describe("prefixes", () => {
  it("are the segment boundary, so /1/ cannot match /10/", () => {
    // `startsWith("products/1/")` happens to be safe here *because* of the trailing slash.
    // The assertion is here so that dropping it — or changing the separator — fails loudly.
    expect(objectKeyPrefix("products", 1)).toBe("products/1/");
    expect(objectKeyPrefix("products", 1)).not.toBe("products/10/");
    expect(ownsObjectKey(buildObjectKey("products", 10, "image/png"), "products", 1)).toBe(false);
  });
});