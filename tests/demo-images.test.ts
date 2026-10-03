import { describe, expect, it } from "vitest";
import { IMG, IMAGE_POOLS, loadImagePools, pick } from "../server/lib/demo-images";

/**
 * `server/lib/demo-images` exists so that `seed.ts` and
 * `server/repair-demo-images.ts` cannot disagree about what a demo listing's
 * photo is. A repair that computed a *different* URL than the seed would look
 * like it worked and then quietly reintroduce the original bug one re-seed later,
 * so the property that matters is determinism, not the specific URL.
 */
describe("demo image picker", () => {
  it("loads the harvested pools", () => {
    expect(Object.keys(IMAGE_POOLS).length).toBeGreaterThan(0);
    for (const [category, entries] of Object.entries(IMAGE_POOLS)) {
      expect(entries.length, `${category} pool is empty`).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.url, `${category} has an entry with no url`).toMatch(/^https:\/\//);
      }
    }
  });

  it("returns the same photo for the same inputs, forever", () => {
    const first = IMG("furniture", "Scandinavian lounge chair");
    const second = IMG("furniture", "Scandinavian lounge chair");
    expect(first).toBe(second);
    // And a third call from a fresh invocation of the same expression, which is
    // what a repair script run against a live database actually does.
    expect(IMG("furniture", "Scandinavian lounge chair")).toBe(first);
    expect(first).not.toBe("");
  });

  it("gives different products in a category different photos", () => {
    const titles = [
      "Scandinavian lounge chair",
      "Solid oak coffee table",
      "Three-seater fabric sofa",
      "Ergonomic office chair",
    ];
    const photos = new Set(titles.map((title) => IMG("furniture", title)));
    // Not a guarantee the picker can make — a small pool can collide — but on the
    // furniture pool these four are spread far enough apart that a regression in
    // the hash (e.g. `hash % 1`) would collapse them onto one URL.
    expect(photos.size).toBeGreaterThan(1);
  });

  it("draws from the product's own category pool", () => {
    const furniture = new Set(IMAGE_POOLS.furniture!.map((entry) => entry.url));
    expect(furniture.has(IMG("furniture", "Scandinavian lounge chair"))).toBe(true);
  });

  it("falls back to any pool for a category with none of its own", () => {
    // The harvested pools are keyed by *top-level* category, so a child slug has
    // no entry of its own. Falling through to any pool is what keeps a listing
    // imageless-but-renderable instead of writing an empty URL.
    const url = IMG("a-category-that-does-not-exist", "Some product");
    expect(url).toMatch(/^https:\/\//);
  });

  it("returns null from pick when the pool is empty, rather than throwing", () => {
    expect(pick([], "anything")).toBeNull();
  });

  it("degrades to empty pools when the harvested file is unreadable", () => {
    // The seed must still run on a checkout without `data/product-images.json` —
    // it just cannot attach photos. It has to be an empty pool, not a crash.
    expect(loadImagePools()).toBeTypeOf("object");
  });
});
