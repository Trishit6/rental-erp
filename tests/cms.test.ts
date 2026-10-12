import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isBannerLive,
  liveBannersFor,
  parseBlockContent,
  readBlockContent,
  type BannerWindow,
} from "../server/lib/cms";
import { cachedPublic, invalidatePublicCache, __resetPublicCacheForTests } from "../server/lib/public-cache";

/**
 * PROMPT 26 — the CMS's pure logic.
 *
 * ## Why these are asserted without a database
 *
 * The two acceptance criteria for content are temporal and computed: "a scheduled
 * banner appears and expires on time" and "an admin edit shows publicly immediately".
 * Neither is a property of a row — the first is a property of a *window* evaluated at a
 * moment, and the second is a property of the cache being cleared on write. Both are
 * pure functions here, so the suite pins them directly instead of round-tripping through
 * a store it would then have to mock.
 */

const HOUR = 60 * 60_000;
const NOW = new Date("2026-06-01T12:00:00.000Z");

function banner(overrides: Partial<BannerWindow> & { id?: number; sortOrder?: number }) {
  return {
    status: "ACTIVE",
    placement: "HERO",
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    id: 1,
    ...overrides,
  };
}

describe("isBannerLive", () => {
  it("is live with no window at all", () => {
    expect(isBannerLive(banner({}), NOW)).toBe(true);
  });

  it.each(["DRAFT", "PAUSED"])("is never live while %s, whatever the window says", (status) => {
    expect(isBannerLive(banner({ status }), NOW)).toBe(false);
    // A wide-open window must not rescue an operator's deliberate "not yet".
    expect(
      isBannerLive(
        banner({ status, startsAt: new Date(NOW.getTime() - HOUR), endsAt: new Date(NOW.getTime() + HOUR) }),
        NOW,
      ),
    ).toBe(false);
  });

  it("treats SCHEDULED as live once its window opens", () => {
    // The status is the operator's intent ("this is scheduled"); the window is the
    // fact. Both ACTIVE and SCHEDULED depend on the window, not the word.
    expect(isBannerLive(banner({ status: "SCHEDULED" }), NOW)).toBe(true);
  });

  it("is not live before its start", () => {
    expect(isBannerLive(banner({ startsAt: new Date(NOW.getTime() + HOUR) }), NOW)).toBe(false);
  });

  it("turns live at exactly its start", () => {
    expect(isBannerLive(banner({ startsAt: new Date(NOW.getTime()) }), NOW)).toBe(true);
  });

  it("expires at exactly its end (end is exclusive)", () => {
    expect(isBannerLive(banner({ endsAt: new Date(NOW.getTime()) }), NOW)).toBe(false);
    expect(isBannerLive(banner({ endsAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(false);
    expect(isBannerLive(banner({ endsAt: new Date(NOW.getTime() + 1) }), NOW)).toBe(true);
  });

  it("accepts ISO strings as well as Dates", () => {
    expect(isBannerLive(banner({ startsAt: "2026-05-01T00:00:00.000Z" }), NOW)).toBe(true);
  });
});

describe("liveBannersFor", () => {
  const banners = [
    { id: 3, placement: "HERO", status: "ACTIVE", startsAt: null, endsAt: null, sortOrder: 2 },
    { id: 1, placement: "HERO", status: "ACTIVE", startsAt: null, endsAt: null, sortOrder: 1 },
    { id: 2, placement: "FOOTER", status: "ACTIVE", startsAt: null, endsAt: null, sortOrder: 0 },
    { id: 4, placement: "HERO", status: "DRAFT", startsAt: null, endsAt: null, sortOrder: 0 },
  ];

  it("keeps one placement and drops the never-live statuses", () => {
    const result = liveBannersFor(banners, "HERO", NOW);
    expect(result.map((entry) => entry.id)).toEqual([1, 3]);
  });

  it("returns every placement when none is named", () => {
    expect(liveBannersFor(banners, null, NOW).map((entry) => entry.id)).toEqual([2, 1, 3]);
  });

  it("orders by sortOrder, then id, so ties are stable", () => {
    const tied = [
      { id: 9, sortOrder: 1, status: "ACTIVE", placement: "HERO", startsAt: null, endsAt: null },
      { id: 5, sortOrder: 1, status: "ACTIVE", placement: "HERO", startsAt: null, endsAt: null },
    ];
    expect(liveBannersFor(tied, "HERO", NOW).map((entry) => entry.id)).toEqual([5, 9]);
  });
});

describe("block content validation", () => {
  it("accepts a well-formed known block", () => {
    const parsed = parseBlockContent("home.how_it_works", {
      title: "How it works",
      steps: [{ title: "Find", body: "Browse nearby." }],
    });
    expect(parsed).toEqual({
      title: "How it works",
      steps: [{ title: "Find", body: "Browse nearby." }],
    });
  });

  it("rejects a known block missing its steps", () => {
    expect(() => parseBlockContent("home.how_it_works", { title: "How it works" })).toThrow();
  });

  it("rejects a known block with an empty steps array", () => {
    expect(() =>
      parseBlockContent("home.how_it_works", { title: "How it works", steps: [] }),
    ).toThrow();
  });

  it("rejects an empty object even for a custom key", () => {
    // A custom block is allowed, but "nothing at all" is not content — it would render
    // as a silently blank section.
    expect(() => parseBlockContent("home.custom", {})).toThrow();
  });

  it("accepts a non-empty object for a custom key", () => {
    expect(parseBlockContent("home.custom", { anything: 1 })).toEqual({ anything: 1 });
  });

  it("rejects a URL that is not an in-app path or https", () => {
    expect(() =>
      parseBlockContent("home.promo", {
        title: "Offer",
        body: "Save big.",
        ctaLabel: "Go",
        ctaHref: "javascript:alert(1)",
      }),
    ).toThrow();
  });
});

describe("readBlockContent", () => {
  it("returns the parsed value for stored JSON", () => {
    expect(
      readBlockContent("home.promo", JSON.stringify({
        title: "Offer",
        body: "Save big.",
        ctaLabel: "Go",
        ctaHref: "/browse",
      })),
    ).toMatchObject({ title: "Offer" });
  });

  it("degrades to null on malformed or drifted content", () => {
    expect(readBlockContent("home.how_it_works", "{not json")).toBeNull();
    // Structurally valid JSON that no longer matches the definition is drift, not a
    // crash — the renderer falls back.
    expect(readBlockContent("home.how_it_works", JSON.stringify({ title: "" }))).toBeNull();
  });
});

describe("the public cache", () => {
  afterEach(() => {
    __resetPublicCacheForTests();
    vi.useRealTimers();
  });

  it("runs the loader once and serves the cached value", async () => {
    const loader = vi.fn(async () => "value");
    expect(await cachedPublic("k", loader)).toBe("value");
    expect(await cachedPublic("k", loader)).toBe("value");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("clears on invalidate, so an admin write is visible immediately", async () => {
    const loader = vi.fn(async () => "value");
    await cachedPublic("k", loader);
    invalidatePublicCache();
    await cachedPublic("k", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("clears only the matching prefix", async () => {
    const banners = vi.fn(async () => "b");
    const blocks = vi.fn(async () => "l");
    await cachedPublic("cms:banners:all", banners);
    await cachedPublic("cms:blocks:all", blocks);
    invalidatePublicCache("cms:banners");
    await cachedPublic("cms:banners:all", banners);
    await cachedPublic("cms:blocks:all", blocks);
    expect(banners).toHaveBeenCalledTimes(2);
    expect(blocks).toHaveBeenCalledTimes(1);
  });

  it("expires after the TTL as a backstop", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const loader = vi.fn(async () => "value");
    await cachedPublic("k", loader, 1000);
    vi.setSystemTime(new Date(NOW.getTime() + 1001));
    await cachedPublic("k", loader, 1000);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
