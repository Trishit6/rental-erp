import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_KINDS,
  activityKindsPresent,
  isActivityKind,
  paginateActivity,
  type ActivityItem,
} from "../server/lib/activity";
import { codeLines, stripComments } from "./support/source-scanning";

/**
 * The activity timeline's pure half, and the two invariants that make it a *private* record.
 *
 * ## Why the helpers carry the weight
 *
 * `buildActivityTimeline` needs a database, and this suite has none. So the merge, the
 * sorting and the filtering are all untested here — and they are exactly where the
 * interesting mistakes live: a page that skips one item, a `totalPages` of 0 that renders
 * an empty pager, a filter chip for a kind the user has never had. What *is* testable
 * without a database is everything downstream of the merge, which is what this file covers.
 *
 * ## The two invariants
 *
 * The timeline is derived from seven tables, which is a lot of places to accidentally drop
 * a scope. Two static assertions hold the line, because neither is observable from the pure
 * functions: no branch may read `admin_audit_log` (an admin's activity is not a user's
 * activity), and every source must be scoped to the session user rather than left unscoped.
 * Both would pass every behavioural test in this file, and both would be a privacy bug.
 */

const ROOT = join(__dirname, "..");

/** A timeline item with sensible defaults, so each test states only what it is about. */
function item(overrides: Partial<ActivityItem> & { id: string }): ActivityItem {
  return {
    kind: "ORDER_PLACED",
    title: "Something happened",
    description: null,
    link: null,
    at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function timeline(count: number): ActivityItem[] {
  return Array.from({ length: count }, (_, index) =>
    item({ id: `item:${String(index).padStart(3, "0")}` }),
  );
}

describe("paginateActivity", () => {
  it("returns the first page of a single-page timeline", () => {
    const page = paginateActivity(timeline(3), 1, 20);

    expect(page.items.map((entry) => entry.id)).toEqual(["item:000", "item:001", "item:002"]);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(20);
    expect(page.totalPages).toBe(1);
  });

  it("slices the requested window out of the merged timeline", () => {
    const page = paginateActivity(timeline(25), 2, 10);

    expect(page.items.map((entry) => entry.id)).toEqual([
      "item:010",
      "item:011",
      "item:012",
      "item:013",
      "item:014",
      "item:015",
      "item:016",
      "item:017",
      "item:018",
      "item:019",
    ]);
    expect(page.totalPages).toBe(3);
  });

  it("rounds totalPages up, so the last page is never half-empty", () => {
    expect(paginateActivity(timeline(21), 1, 10).totalPages).toBe(3);
    expect(paginateActivity(timeline(20), 1, 10).totalPages).toBe(2);
  });

  it("reports one page for an empty timeline rather than zero", () => {
    // `0` renders an empty pager, which reads as "the page failed" rather than "nothing
    // has happened yet" — and an account with no activity is a normal state.
    const page = paginateActivity([], 1, 20);

    expect(page.items).toEqual([]);
    expect(page.totalPages).toBe(1);
  });

  it("falls back to page 1 for a nonsensical page", () => {
    // These arrive from the URL, so a hand-edited `?page=abc` must degrade.
    for (const page of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(paginateActivity(timeline(5), page, 20).page).toBe(1);
    }
  });

  it("caps the page size and falls back to the default for a nonsensical one", () => {
    // Without the cap, `?pageSize=100000` would ask the server to send the whole
    // timeline in one response.
    expect(paginateActivity(timeline(60), 1, 5000).pageSize).toBe(50);
    for (const size of [0, -10, 2.5, Number.NaN]) {
      expect(paginateActivity(timeline(5), 1, size).pageSize).toBe(20);
    }
  });

  it("returns an empty page past the end instead of throwing", () => {
    // Deleting the last item on the final page leaves the user on a page that no longer
    // exists; an empty page with the real `totalPages` lets the pager render the way back.
    const page = paginateActivity(timeline(5), 9, 20);

    expect(page.items).toEqual([]);
    expect(page.page).toBe(9);
    expect(page.totalPages).toBe(1);
  });
});

describe("activityKindsPresent", () => {
  it("is empty for an empty timeline", () => {
    expect(activityKindsPresent([])).toEqual([]);
  });

  it("reports each kind once, however many items share it", () => {
    const present = activityKindsPresent([
      item({ id: "a", kind: "ORDER_PLACED" }),
      item({ id: "b", kind: "ORDER_PLACED" }),
      item({ id: "c", kind: "REVIEW_SUBMITTED" }),
    ]);

    expect(present).toEqual(["ORDER_PLACED", "REVIEW_SUBMITTED"]);
  });

  it("orders by the declared kind order, not by recency", () => {
    // The chip row is a fixed sequence in the UI. Deriving it from the timeline instead
    // would reshuffle the chips every time the user did something, which reads as a bug.
    const present = activityKindsPresent([
      item({ id: "a", kind: "PRODUCT_SOLD" }),
      item({ id: "b", kind: "ACCOUNT_CREATED" }),
      item({ id: "c", kind: "ORDER_DELIVERED" }),
    ]);

    expect(present).toEqual(["ACCOUNT_CREATED", "ORDER_DELIVERED", "PRODUCT_SOLD"]);
  });

  it("omits kinds this user has no history of", () => {
    // The point of deriving rather than declaring: a static list of nine chips is nine
    // chips that mostly return nothing.
    expect(activityKindsPresent([item({ id: "a", kind: "LISTING_CREATED" })])).toEqual([
      "LISTING_CREATED",
    ]);
  });
});

describe("isActivityKind", () => {
  it("accepts every declared kind", () => {
    for (const kind of ACTIVITY_KINDS) {
      expect(isActivityKind(kind)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    // The route narrows with this so a mistyped `?kind=` degrades to "no filter" instead
    // of 400ing — a filter chip that throws on a stale bookmark is worse than no filter.
    for (const value of ["", "order_placed", "ORDERPLACED", "__proto__", "toString"]) {
      expect(isActivityKind(value)).toBe(false);
    }
  });

  it("rejects a kind that was removed from the vocabulary", () => {
    // The narrowing has to track the declared list, not a snapshot of it: a renamed kind
    // must stop being accepted, or the route would pass through a value the timeline
    // cannot produce and the filter would silently match nothing.
    const everyKind = new Set<string>(ACTIVITY_KINDS);
    expect(everyKind.has("ORDER_COMPLETED")).toBe(false);
    expect(isActivityKind("ORDER_COMPLETED")).toBe(false);
  });
});

describe("the timeline is scoped to one person", () => {
  const source = stripComments(readFileSync(join(ROOT, "server/lib/activity.ts"), "utf8"));

  it("reads the file it is meant to be checking", () => {
    expect(source).toContain("buildActivityTimeline");
    expect(source.length).toBeGreaterThan(2000);
  });

  it("never reads the admin audit log", () => {
    // The activity centre is a private record of one person's own history. `admin_audit_log`
    // is a table of *other people's* actions, so a branch reading it would report a
    // stranger's refund approval as your activity. Nothing behavioural above would notice,
    // because the pure helpers never see a row.
    const offenders = codeLines(source).filter((line) => /audit/i.test(line));
    expect(offenders).toEqual([]);
  });

  it("scopes every source to the session user", () => {
    /*
     * One `userId`, taken from the session, and every source compared against it.
     *
     * The predicates are listed rather than counted: "six `eq` calls" would pass with one
     * source scoped twice and another not at all. Naming each one means a source that loses
     * its scope fails by name, and a new source has to be added deliberately.
     */
    expect(source).toContain("const userId = user.id;");
    for (const predicate of [
      "eq(users.id, userId)",
      "eq(orders.userId, userId)",
      "eq(rentals.renterId, userId)",
      "eq(reviews.userId, userId)",
      "eq(products.sellerId, userId)",
      "eq(orderItems.sellerId, userId)",
    ]) {
      expect(source).toContain(predicate);
    }

    // And nothing in the module accepts a user id as a parameter, so there is no path by
    // which a caller could ask for somebody else's history.
    expect(source).not.toMatch(/function\s+\w+\([^)]*userId\s*:/);
    expect(source).not.toMatch(/\buserId\s*:\s*(?!user\.id)/);
  });

  it("gates the seller-only sources on the role as well as the id", () => {
    // A customer who somehow has listings — a role demotion mid-session — should not have
    // their own public listings reported back to them as activity.
    expect(source.match(/\bseller\s*\?/g)?.length).toBe(2);
    expect(source).toContain("isSellerRole(user.role)");
  });

  it("excludes rentals the user owns, reporting only the ones they took out", () => {
    // `ownerId` is deliberately not read: a rental appearing once as renter and once as
    // owner would report the owner's business to the renter.
    expect(source).toContain("eq(rentals.renterId, userId)");
    expect(source).not.toMatch(/rentals\.ownerId/);
  });

  it("drops entries with no timestamp instead of inventing one", () => {
    expect(source).toContain('draft.at !== null');
  });
});
