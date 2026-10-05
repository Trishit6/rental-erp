import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_EMAIL_CAPABLE,
  isEmailWorthy,
  isInAppWorthy,
  isInternalRoute,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  notificationCategoryFor,
  notificationDestination,
  notificationEventKey,
  notificationIconFor,
  supportedNotificationTypes,
  type NotificationType,
} from "../server/lib/notification-events";
import {
  CATEGORY_ORDER,
  CATEGORY_VALUES,
  KNOWN_ICON_KEYS,
} from "../src/features/notifications/components/schema";
import { EMAIL_CAPABLE_CATEGORIES } from "../src/features/notifications/types";
import type { NotificationIconKey } from "../src/features/notifications/types";
import { stripComments } from "./support/source-scanning";

/**
 * The notification vocabulary, and the two things that can silently rot underneath it.
 *
 * `server/lib/notification-events.ts` is a lookup table — forty-odd types, each with a
 * category, a label, an entity and a destination. Nothing in TypeScript connects it to
 * the code that *emits* those types, or to the copy the browser renders, because the two
 * live on opposite sides of an HTTP boundary. That leaves three ways for the table to
 * become fiction, and all three are silent:
 *
 *  1. **A type is declared `supported: true` with no emitter.** `isInAppWorthy` then
 *     allows it, the preferences UI offers it, and no code path ever writes it. This is
 *     not hypothetical: `ORDER_READY_FOR_PICKUP` and `ORDER_COMPLETED` were both declared
 *     supported for a build, while `routes/admin.ts` folded `READY_FOR_PICKUP` into
 *     `ORDER_PROCESSING` and `COMPLETED` into `ORDER_DELIVERED` — so the vocabulary
 *     promised two notifications and the app delivered two different, wrong ones.
 *
 *  2. **A type is emitted but not declared.** The row still writes (an unmapped type
 *     falls back to category `ORDERS` and icon `DEFAULT`), but it lands in the wrong
 *     category, gets no preference switch, and never gets email.
 *
 *  3. **The server and client disagree about a vocabulary.** `server/` owns the
 *     categories and icon keys; `src/features/notifications/` mirrors them because it
 *     cannot import across the boundary. Two copies drift, and the feed then filters by
 *     a category the server never sends, or renders an icon key the server sends but the
 *     client cannot draw.
 *
 * The first assertion below is the important one, and it works by *reading the server
 * source* rather than by calling the emitters — the emitters need a database, and the
 * whole point of this suite is that it runs with none.
 */

const ROOT = join(__dirname, "..");
const SERVER = join(ROOT, "server");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.ts$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/**
 * Server sources, minus the places where a type may legitimately be *named* without
 * being *emitted*.
 *
 * Excluded:
 *  - `notification-events.ts` — the table itself, which names every type by definition;
 *  - `seed.ts` / `seed-history.ts` — these write rows directly, which is exactly why the
 *    legacy tokens exist, and counting them as emitters would make every assertion below
 *    pass vacuously;
 *  - `activity.ts` — `PRODUCT_SOLD` and friends appear there as *activity kinds* in the
 *    derived timeline, a separate vocabulary with its own module, not notification writes;
 *  - `schema.ts` — its comment quotes `"ORDER_SHIPPED:1048"` as an example key.
 *
 * What is left is code that can actually call `notify`/`notifyMany`/`notifyAdmins`, which
 * is the question being asked.
 */

/*
 * `stripComments` lives in `tests/support/source-scanning.ts` because two test files read
 * source as their subject and a second, subtly different copy of the comment-stripping
 * rules is exactly how the first one ended up matching prose instead of code.
 */
const EMITTER_SOURCES = sourceFiles(SERVER)
  .map((file) => ({
    path: relative(ROOT, file).replace(/\\/g, "/"),
    contents: stripComments(readFileSync(file, "utf8")),
  }))
  .filter(
    ({ path }) =>
      !path.endsWith("lib/notification-events.ts") &&
      !path.endsWith("seed.ts") &&
      !path.endsWith("seed-history.ts") &&
      !path.endsWith("lib/activity.ts") &&
      !path.endsWith("schema.ts") &&
      !path.endsWith("lib/seed-truncate.ts"),
  );

const SUPPORTED = supportedNotificationTypes();

describe("the server source is actually being read", () => {
  // Without this, a broken path makes every assertion below pass while checking nothing —
  // the exact failure mode this file exists to prevent, applied to itself.
  it("finds the emitters it means to scan", () => {
    expect(EMITTER_SOURCES.length).toBeGreaterThan(10);
    expect(EMITTER_SOURCES.some((f) => f.path.endsWith("routes/orders.ts"))).toBe(true);
    expect(EMITTER_SOURCES.some((f) => f.path.endsWith("lib/order-creation.ts"))).toBe(true);
  });

  it("found a vocabulary worth checking", () => {
    expect(SUPPORTED.length).toBeGreaterThan(30);
  });
});

describe("every declared type has an emitter", () => {
  /**
   * A type named in an emitter file as a quoted string literal.
   *
   * Quoted rather than bare, because the emitters pass `type:` as a string literal and a
   * bare match would also hit an import, an enum key or — the reason comments are
   * stripped above — a doc comment that mentions the token.
   */
  function emittersOf(type: NotificationType): string[] {
    const pattern = new RegExp(`["']${type}["']`);
    return EMITTER_SOURCES.filter((file) => pattern.test(file.contents)).map((file) => file.path);
  }

  const orphans = SUPPORTED.filter((type) => emittersOf(type).length === 0).sort();

  it("no supported type is declared without a real emitter", () => {
    // This is the assertion that caught `ORDER_READY_FOR_PICKUP` and `ORDER_COMPLETED`.
    expect(orphans).toEqual([]);
  });

  it("finds the emitters for the well-wired types", () => {
    // The mirror image: an assertion that is empty because the scan is broken looks
    // exactly like an assertion that is empty because the code is.
    expect(emittersOf("ORDER_PLACED")).toContain("server/lib/order-creation.ts");
    expect(emittersOf("ORDER_CANCELLED")).toContain("server/routes/orders.ts");
    expect(emittersOf("MESSAGE_RECEIVED")).toContain("server/routes/messages.ts");
    expect(emittersOf("REVIEW_RECEIVED")).toContain("server/routes/reviews.ts");
    expect(emittersOf("PRODUCT_SOLD")).toContain("server/lib/order-creation.ts");
    expect(emittersOf("WISHLIST_PRICE_CHANGE")).toContain("server/routes/seller.ts");
    expect(emittersOf("LISTING_APPROVED")).toContain("server/routes/admin.ts");
    expect(emittersOf("ORDER_READY_FOR_PICKUP")).toContain("server/routes/admin.ts");
    expect(emittersOf("ORDER_COMPLETED")).toContain("server/routes/admin.ts");
  });
});

describe("the client and the server agree about the vocabularies", () => {
  it("declares the same categories, in the same order", () => {
    expect([...CATEGORY_ORDER]).toEqual([...NOTIFICATION_CATEGORIES]);
  });

  it("uses the same category token list in its parser", () => {
    expect([...CATEGORY_VALUES]).toEqual([...NOTIFICATION_CATEGORIES]);
  });

  it("agrees about which categories have an email channel", () => {
    expect([...EMAIL_CAPABLE_CATEGORIES].sort()).toEqual(
      NOTIFICATION_CATEGORIES.filter((category) => CATEGORY_EMAIL_CAPABLE[category]).sort(),
    );
  });

  it("declares every icon key the server can emit", () => {
    // Not just "the lists are the same length" — an icon key the server sends and the
    // client has no case for renders as a blank circle, which is invisible in a diff of
    // two arrays that happens to match in size.
    const clientIcons = new Set<string>(KNOWN_ICON_KEYS);
    const serverIcons = new Set<string>(
      Object.keys(NOTIFICATION_TYPES).map((type) => notificationIconFor(type)),
    );
    expect([...serverIcons].filter((icon) => !clientIcons.has(icon))).toEqual([]);
  });

  it("produces only icon keys the client knows, for every declared type", () => {
    const known = new Set<string>(KNOWN_ICON_KEYS);
    for (const type of Object.keys(NOTIFICATION_TYPES)) {
      expect(known.has(notificationIconFor(type))).toBe(true);
    }
  });

  it("resolves a category for every declared type", () => {
    for (const [type, definition] of Object.entries(NOTIFICATION_TYPES)) {
      expect(definition.category).toBe(notificationCategoryFor(type));
      expect(NOTIFICATION_CATEGORIES).toContain(definition.category);
    }
  });
});

describe("an unsupported type is refused but still describable", () => {
  it("refuses to deliver an unsupported type", () => {
    expect(isInAppWorthy("ORDER_OUT_FOR_DELIVERY")).toBe(false);
    expect(isEmailWorthy("ORDER_OUT_FOR_DELIVERY")).toBe(false);
  });

  it("refuses a type it has never heard of", () => {
    // The shape a row written by an older build has. It must not be able to pull mail
    // out of the system, and it must not be treated as deliverable.
    expect(isInAppWorthy("SOMETHING_FROM_2030")).toBe(false);
    expect(isEmailWorthy("SOMETHING_FROM_2030")).toBe(false);
  });

  it("still gives an unknown type a label, an icon and a category, so it renders", () => {
    // The asymmetry is deliberate: display is permissive, generation is not. A row in the
    // database has to render even when the build that wrote it is gone.
    expect(notificationIconFor("SOMETHING_FROM_2030")).toBe<NotificationIconKey>("DEFAULT");
    expect(notificationCategoryFor("SOMETHING_FROM_2030")).toBe("ORDERS");
  });

  it("refuses to build a destination for an unknown type", () => {
    // No destination means no link, so a stale row cannot navigate anywhere — which is
    // the only safe answer when we do not know what the event was about.
    expect(notificationDestination("SOMETHING_FROM_2030")).toBeNull();
  });

  it("delivers every supported type", () => {
    for (const type of SUPPORTED) {
      expect(isInAppWorthy(type)).toBe(true);
    }
  });
});

describe("a destination is always an internal route", () => {
  /**
   * A context carrying every id any destination can be built from.
   *
   * The point is that a type is *only* as safe as the ids its call site happens to pass,
   * so the sweep below asserts the property over the full set rather than per call site.
   */
  const fullContext = {
    orderId: 42,
    orderNumber: "RV-2026-8F3K2A",
    rentalId: 7,
    productId: 100,
    productSlug: "apple-macbook-air-m2",
    conversationId: 3,
  };

  it("builds an internal route for every supported type that has a destination", () => {
    const withDestination = SUPPORTED.filter(
      (type) => NOTIFICATION_TYPES[type].destination !== null,
    );
    expect(withDestination.length).toBeGreaterThan(20);

    for (const type of withDestination) {
      const link = notificationDestination(type, fullContext);
      expect(link, `${type} produced no link`).not.toBeNull();
      expect(isInternalRoute(link), `${type} produced ${String(link)}`).toBe(true);
    }
  });

  it("has no destination only where the type genuinely has no entity", () => {
    // `PAYMENT_FAILED` is the one deliberate `null`: a failed payment has no order to
    // show, and the call site overrides the link with the checkout page.
    const withoutDestination = SUPPORTED.filter(
      (type) => NOTIFICATION_TYPES[type].destination === null,
    );
    expect(withoutDestination).toEqual(["PAYMENT_FAILED"]);
  });

  it("answers null rather than a broken link when the context is missing", () => {
    expect(notificationDestination("RENTAL_RETURNED", {})).toBeNull();
    expect(notificationDestination("WISHLIST_BACK_IN_STOCK", { productId: 5 })).toBeNull();
    expect(notificationDestination("ORDER_PLACED", {})).toBeNull();
  });

  it("falls back from an order number to the numeric id", () => {
    expect(notificationDestination("ORDER_SHIPPED", { orderNumber: "RV-1" })).toBe("/orders/RV-1");
    expect(notificationDestination("ORDER_SHIPPED", { orderId: 9 })).toBe("/orders/9");
  });

  it("escapes an order number rather than trusting it", () => {
    // `orderNumber` is server-generated, but the destination is assembled from a string
    // and the client pushes it straight to `navigate({ to })`.
    expect(notificationDestination("ORDER_SHIPPED", { orderNumber: "a/../b" })).toBe(
      "/orders/a%2F..%2Fb",
    );
  });

  it("points a message with no conversation at the inbox, not at a thread that is not there", () => {
    expect(notificationDestination("MESSAGE_RECEIVED", { conversationId: 3 })).toBe(
      "/messages?conversation=3",
    );
    expect(notificationDestination("MESSAGE_RECEIVED", {})).toBe("/messages");
  });
});

describe("isInternalRoute refuses everything the client would choke on", () => {
  it("accepts an absolute internal path", () => {
    expect(isInternalRoute("/notifications")).toBe(true);
    expect(isInternalRoute("/messages?conversation=3")).toBe(true);
  });

  it("refuses nothing at all", () => {
    expect(isInternalRoute(null)).toBe(false);
    expect(isInternalRoute(undefined)).toBe(false);
    expect(isInternalRoute("")).toBe(false);
  });

  it("refuses a relative path, a scheme and a scheme-relative URL", () => {
    // `link` is pushed to `navigate({ to: link })`. `//evil.example` would leave the
    // origin entirely, and `javascript:` is the obvious one.
    expect(isInternalRoute("notifications")).toBe(false);
    expect(isInternalRoute("https://evil.example/steal")).toBe(false);
    expect(isInternalRoute("//evil.example/steal")).toBe(false);
    expect(isInternalRoute("javascript:alert(1)")).toBe(false);
  });

  it("refuses a backslash, which some browsers treat as a path separator", () => {
    // `/\evil.example` is protocol-relative to enough browsers that it is not worth
    // trying to enumerate which ones.
    expect(isInternalRoute("/\\evil.example")).toBe(false);
    expect(isInternalRoute("/a\\b")).toBe(false);
  });

  it("refuses whitespace and angle brackets", () => {
    expect(isInternalRoute("/a b")).toBe(false);
    expect(isInternalRoute('/a"><script>')).toBe(false);
  });
});

describe("notificationEventKey", () => {
  it("names the type and the entity", () => {
    expect(notificationEventKey("ORDER_SHIPPED", 1048)).toBe("ORDER_SHIPPED:1048");
  });

  it("handles a missing entity without producing a dangling colon", () => {
    // `undefined` and `null` mean "no entity", and the key must not look like
    // `TYPE:undefined`, which would be a *different* key per call site per accident.
    expect(notificationEventKey("WISHLIST_BACK_IN_STOCK", undefined)).toBe(
      "WISHLIST_BACK_IN_STOCK:none",
    );
    expect(notificationEventKey("WISHLIST_BACK_IN_STOCK", null)).toBe(
      "WISHLIST_BACK_IN_STOCK:none",
    );
  });

  it("adds a discriminator when one is given", () => {
    expect(notificationEventKey("RENTAL_RETURN_DUE", 207, "2026-10-05")).toBe(
      "RENTAL_RETURN_DUE:207:2026-10-05",
    );
  });

  it("ignores an empty discriminator, which would otherwise make a different key", () => {
    // `""` and `undefined` must not diverge: one call site passing an empty string for
    // "no discriminator" would silently defeat the idempotency it is relying on.
    expect(notificationEventKey("RENTAL_RETURN_DUE", 207, "")).toBe("RENTAL_RETURN_DUE:207");
    expect(notificationEventKey("RENTAL_RETURN_DUE", 207)).toBe("RENTAL_RETURN_DUE:207");
  });

  /**
   * The bug the discriminator exists to prevent.
   *
   * `notifications.event_key` carries a *global* unique index, so two rows cannot share
   * a key even when they are addressed to different people. A fan-out that reuses one
   * key notifies the first recipient and silently drops the rest — which is exactly what
   * `notifyAdmins` did before it started appending the admin's own id.
   */
  it("gives two recipients of one event different keys", () => {
    const shared = notificationEventKey("ORDER_CANCELLED", 555);
    const first = notificationEventKey("ORDER_CANCELLED", 555, 12);
    const second = notificationEventKey("ORDER_CANCELLED", 555, 13);
    expect(first).not.toBe(second);
    expect(shared).not.toBe(first);
  });

  it("is stable, so a retried request produces the same key", () => {
    expect(notificationEventKey("ORDER_PLACED", 1)).toBe(notificationEventKey("ORDER_PLACED", 1));
  });

  it("separates two entities of the same type in the same millisecond", () => {
    expect(notificationEventKey("ORDER_PLACED", 1)).not.toBe(notificationEventKey("ORDER_PLACED", 2));
  });

  it("fits the column even for a pathological discriminator", () => {
    // `event_key` is varchar(190); a silently truncated key would still be unique, but
    // the assertion documents that the bound is deliberate rather than incidental.
    const key = notificationEventKey("ORDER_SHIPPED", 1, "x".repeat(500));
    expect(key.length).toBeLessThanOrEqual(190);
  });
});
