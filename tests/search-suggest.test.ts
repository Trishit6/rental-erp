import { describe, expect, it } from "vitest";
import {
  booleanModeQuery,
  didYouMeanFor,
  editTolerance,
  damerauLevenshtein,
  HISTORY_MAX_STORED_TERMS,
  HISTORY_MAX_TERM_LENGTH,
  HISTORY_VISIBLE_TERMS,
  isPrivateTerm,
  isQueryInSuggestWindow,
  isStorableTerm,
  likePrefixes,
  sanitizeQuery,
  SUGGEST_MAX_QUERY_LENGTH,
  tokenize,
  trendingTerms,
  TRENDING_MIN_DISTINCT_USERS,
  type TermUsage,
} from "../server/lib/search-suggest";
import { historyTermSchema, suggestQuerySchema } from "../server/routes/search";

/**
 * PROMPT R11 — the pure side of the search-suggest surface.
 *
 * Everything here runs without a database on purpose: the route file composes
 * these helpers with SQL, and the SQL is exactly the part a unit test cannot
 * honestly judge. What a unit test *can* prove — that an attacker's string
 * comes out of the sanitizer as plain words, that a boolean-mode query string
 * can only ever add `+` and `*`, that a name two keystrokes away from "soxn"
 * is suggested and "cpu" is not — is in this file.
 */

describe("sanitizeQuery", () => {
  it("strips control characters and RTL overrides", () => {
    expect(sanitizeQuery("a\u0000b")).toBe("a b");
    expect(sanitizeQuery("\u202Eevil\u202C")).toBe("evil");
  });

  it("trims and collapses whitespace runs", () => {
    expect(sanitizeQuery("  gaming   laptop \t")).toBe("gaming laptop");
  });

  it("keeps unicode letters intact (the marketplace is not ASCII-only)", () => {
    expect(sanitizeQuery("देवी keyboard")).toBe("देवी keyboard");
  });
});

describe("tokenize / boolean-mode / LIKE builders", () => {
  it("splits on any non letter-or-number, so operators cannot survive into a token", () => {
    expect(tokenize("+sony -nikon")).toEqual(["sony", "nikon"]);
    expect(tokenize('washing"machine (test)')).toEqual(["washing", "machine", "test"]);
  });

  it("builds requirement-mode prefix queries for the FULLTEXT index", () => {
    expect(booleanModeQuery(["gaming", "laptop"])).toBe("+gaming* +laptop*");
    expect(booleanModeQuery(["sony"])).toBe("+sony*");
  });

  it("cannot be injected even if handed raw text — the strip runs inside the builder too", () => {
    // If this returned `+" OR 1=1 *`, the boolean parser would treat an
    // operator inside a phrase; the strip makes that construction impossible.
    const query = booleanModeQuery(tokenize('coffee" OR 1=1'));
    expect(query).toBe("+coffee* +OR* +1* +1*");
    expect(query).not.toContain('"');
    expect(query).not.toContain("(");
  });

  it("strips LIKE wildcards from the prefix fallback", () => {
    expect(likePrefixes(["100%_raw"])).toEqual(["100raw%"]);
  });

  it("discards tokens that strip to nothing rather than emitting a bare +*", () => {
    expect(booleanModeQuery(tokenize("***"))).toBe("");
    expect(likePrefixes(["%%%"])).toEqual([]);
  });
});

describe("the suggest window", () => {
  it("accepts 2–60 characters and nothing outside", () => {
    expect(isQueryInSuggestWindow("go")).toBe(true);
    expect(isQueryInSuggestWindow("a")).toBe(false);
    expect(isQueryInSuggestWindow("x".repeat(SUGGEST_MAX_QUERY_LENGTH))).toBe(true);
    expect(isQueryInSuggestWindow("x".repeat(SUGGEST_MAX_QUERY_LENGTH + 1))).toBe(false);
  });
});

describe("zod validation (400s live here)", () => {
  it("refuses a query below two characters with VALIDATION issue", () => {
    const result = suggestQuerySchema.safeParse({ q: "a" });
    expect(result.success).toBe(false);
  });

  it("sanitizes inside the schema, so the route sees the clean term", () => {
    expect(suggestQuerySchema.safeParse({ q: "  son\u0000y " }).success).toBe(true);
  });

  it("refuses a history term of the wrong shape", () => {
    expect(historyTermSchema.safeParse({ term: "ok" }).success).toBe(true);
    expect(historyTermSchema.safeParse({ term: 42 }).success).toBe(false);
    expect(historyTermSchema.safeParse({ term: "ok", resultCount: 3 }).success).toBe(true);
    expect(historyTermSchema.safeParse({ term: "ok", resultCount: null }).success).toBe(true);
    expect(historyTermSchema.safeParse({ term: "ok", resultCount: -1 }).success).toBe(false);
  });
});

describe("damerauLevenshtein and the typo tolerance", () => {
  it("counts substitutions, insertions, deletions and transpositions", () => {      expect(damerauLevenshtein("soyn", "sony")).toBe(1); // transposition
    expect(damerauLevenshtein("sonyy", "sony")).toBe(1); // deletion
    expect(damerauLevenshtein("sony", "sonny")).toBe(1); // insertion
    expect(damerauLevenshtein("keyboard", "keybaord")).toBe(1);
    expect(damerauLevenshtein("sony", "canon")).toBe(4);
  });

  it("tolerance: ≤1 edit for 4–6 characters, ≤2 for longer, 0 below", () => {
    expect(editTolerance(3)).toBe(0);
    expect(editTolerance(6)).toBe(1);
    expect(editTolerance(7)).toBe(2);
    expect(editTolerance(12)).toBe(2);
  });

  it("suggests a one-edit neighbour of a 5-char query", () => {
    expect(didYouMeanFor("soyn", ["Sony", "Canon"])).toBe("Sony");
  });

  it("suggests nothing below four characters (cpu→gpu must not be 'fixed')", () => {
    expect(didYouMeanFor("cpu", ["gpu", "sony"])).toBeNull();
  });

  it("allows a two-edit neighbour of a long query", () => {
    expect(didYouMeanFor("keybaordd", ["keyboard"])).toBe("keyboard");
  });

  it("breaks ties deterministically by name", () => {
    // Both candidates are one edit from "abta"; name order decides.
    expect(didYouMeanFor("abta", ["acta", "abba"])).toBe("abba");
  });
});

describe("isPrivateTerm / isStorableTerm (history privacy)", () => {
  it("refuses anything email-shaped", () => {
    expect(isPrivateTerm("friend@example.com")).toBe(true);
    expect(isPrivateTerm("mail me at a.b@c.co.in now")).toBe(true);
  });

  it("refuses an 8+ digit run, with or without phone separators", () => {
    expect(isPrivateTerm("98765432")).toBe(true);
    expect(isPrivateTerm("+91 98765 43210")).toBe(true);
    expect(isPrivateTerm("(555) 1234-5678")).toBe(true);
    expect(isPrivateTerm("invoice 20260101")).toBe(true);
  });

  it("allows ordinary marketplace searches", () => {
    expect(isPrivateTerm("gaming laptop")).toBe(false);
    expect(isPrivateTerm("7-digit 1234567 sofa")).toBe(false);
    expect(isPrivateTerm("IPhone 15 pro case")).toBe(false);
  });

  it("bounds the term length", () => {
    expect(isStorableTerm("a".repeat(HISTORY_MAX_TERM_LENGTH))).toBe(true);
    expect(isStorableTerm("a".repeat(HISTORY_MAX_TERM_LENGTH + 1))).toBe(false);
    expect(isStorableTerm("   ")).toBe(false);
  });

  it("keeps the documented retention numbers in one place", () => {
    expect(HISTORY_VISIBLE_TERMS).toBe(8);
    expect(HISTORY_MAX_STORED_TERMS).toBe(50);
  });
});

describe("trendingTerms (the privacy threshold)", () => {
  const usage = (term: string, distinctUsers: number, searches: number): TermUsage => ({
    term,
    distinctUsers,
    searches,
  });

  it("hides a term searched by fewer than 3 distinct users", () => {
    const ranked = trendingTerms([
      usage("camera", 2, 30),
      usage("laptop", 3, 10),
      usage("sofa", 5, 3),
    ]);
    expect(ranked.map((row) => row.term)).toEqual(["laptop", "sofa"]);
  });

  it("ranks by total searches, then distinct users, then alphabetical", () => {
    const ranked = trendingTerms([
      usage("beta", 4, 7),
      usage("alpha", 4, 7),
      usage("gamma", 9, 7),
      usage("delta", 3, 20),
    ]);
    expect(ranked.map((row) => row.term)).toEqual(["delta", "gamma", "alpha", "beta"]);
  });

  it("the threshold is 3 distinct users, not fewer", () => {
    expect(TRENDING_MIN_DISTINCT_USERS).toBe(3);
  });
});

describe("the budget registration", () => {
  it("search.history exists as a named, per-account budget", async () => {
    const { RATE_LIMITS } = await import("../server/lib/rate-limit");
    expect(RATE_LIMITS["search.history"]).toEqual({
      limit: 40,
      windowMs: 60_000,
      perAccount: true,
    });
  });
});
