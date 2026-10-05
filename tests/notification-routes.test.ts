import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import {
  DEFAULT_NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_PAGE_SIZES,
  parseNotificationListQuery,
} from "../server/lib/notification-queries";
import { NOTIFICATION_CATEGORIES } from "../server/lib/notification-events";
import { notificationsRoute } from "../server/routes/notifications";
import { PREFERENCE_GROUPS, PREFERENCE_KEYS } from "../src/features/notifications/components/schema";
import { startRouter, type Harness } from "./support/http-harness";
import { codeLines, stripComments } from "./support/source-scanning";

/**
 * The notifications API's route table, its gate, and the shape of the preferences it accepts.
 *
 * ## The three properties
 *
 * **The gate is router-wide.** `requireUser` is registered with `use("*")`, which runs
 * *before* routing — `Router.build` calls `runMiddleware` with a null route when nothing
 * matched. So an anonymous caller gets 401 from a path that does not exist, and cannot
 * enumerate the API by watching for a 404 instead of a 401. That is only true if the mount
 * prefix resolves, which makes this file also a test of the mount itself.
 *
 * **Literal paths are not swallowed by `/:id`.** `/unread-count`, `/preferences` and
 * `/read-all` sit beside `/api/notifications/:id{[0-9]+}`. The digit constraint is what
 * keeps them apart — the same class of bug `tests/review-routes.test.ts` documents, where
 * an unconstrained `/:id` swallowed `/mine`, `/seller` and `/moderation` and every
 * handler-level test passed anyway.
 *
 * **A preference is only accepted if the app can honour it.** This is the one with a user
 * in it. `PREFERENCE_GROUPS` renders a checkbox per category, and `wishlist` and `admin`
 * render an in-app switch *only* — so the server's schema must refuse `email` for exactly
 * those two groups. If it accepted one, the write would be stored and then dropped by the
 * notifier, and the switch would look saved while doing nothing. That is the whole class
 * of bug this assertion exists to prevent, and it cannot be caught by sending a request:
 * the drop is silent and correct-looking.
 */

const ROOT = join(__dirname, "..");

/**
 * Full request paths. Declarations in the route file are relative to the mount
 * (`server/index.ts` mounts at `/api/notifications`), while the harness sends the literal
 * path it is handed — see the same note in `tests/messages-routes.test.ts`.
 */
const ENDPOINTS: [method: string, path: string][] = [
  ["GET", "/api/notifications/"],
  ["GET", "/api/notifications/unread-count"],
  ["GET", "/api/notifications/preferences"],
  ["PATCH", "/api/notifications/preferences"],
  ["POST", "/api/notifications/read-all"],
  ["PATCH", "/api/notifications/1/read"],
  ["DELETE", "/api/notifications/1"],
  ["PATCH", "/api/notifications/not-a-number/read"],
  ["DELETE", "/api/notifications/not-a-number"],
  // Not real endpoints — the gate must answer before routing can 404 them.
  ["GET", "/api/notifications/does-not-exist"],
  ["DELETE", "/api/notifications/1/force"],
];

function anonymousRouter(): Router {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    c.set(SESSION_USER_KEY, null);
    await next();
  });
  router.route("/api/notifications", notificationsRoute);
  return router;
}

describe("the notifications API refuses anonymous callers", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startRouter(anonymousRouter());
  });

  afterAll(async () => {
    await harness.close();
  });

  for (const [method, path] of ENDPOINTS) {
    it(`${method} ${path} answers 401, not 404`, async () => {
      const res = await harness.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify({}),
      });

      expect(res.status).toBe(401);
      const payload = (await res.json()) as { error?: { code?: string } };
      expect(payload.error?.code).toBe("UNAUTHENTICATED");
    });
  }
});

describe("the literal notification paths are not swallowed by /:id", () => {
  /** The real (method, path) pairs, re-registered with handlers that echo the pattern. */
  const replay = (() => {
    const router = new Router();
    for (const route of notificationsRoute.routes()) {
      const handler = (c: { text: (body: string, status?: number) => void }) => {
        c.text(route.path, 200);
      };
      const method = route.method.toLowerCase() as "get" | "post" | "patch" | "delete";
      router[method](route.path, handler);
    }
    return router;
  })();

  let harness: Harness;

  beforeAll(async () => {
    harness = await startRouter(replay);
  });

  afterAll(async () => {
    await harness.close();
  });

  async function matched(path: string, method = "GET"): Promise<string | null> {
    const res = await harness.request(path, { method });
    return res.status === 200 ? res.text() : null;
  }

  it("routes the feed to /", async () => {
    expect(await matched("/")).toBe("/");
  });

  it("routes /unread-count to its own handler", async () => {
    // The badge endpoint. If `/:id` ever swallowed this, the bell's number would come
    // from the feed handler and the "why is the badge slow" problem would silently return.
    expect(await matched("/unread-count")).toBe("/unread-count");
  });

  it("routes both preference verbs to /preferences", async () => {
    expect(await matched("/preferences")).toBe("/preferences");
    expect(await matched("/preferences", "PATCH")).toBe("/preferences");
  });

  it("routes /read-all to its own handler", async () => {
    expect(await matched("/read-all", "POST")).toBe("/read-all");
  });

  it("routes the per-row read control to its handler", async () => {
    expect(await matched("/7/read", "PATCH")).toBe("/:id{[0-9]+}/read");
  });

  it("routes dismissal to the digit-constrained id", async () => {
    expect(await matched("/7", "DELETE")).toBe("/:id{[0-9]+}");
  });

  it("does not treat a non-numeric id as a notification id", async () => {
    expect(await matched("/abc/read", "PATCH")).toBeNull();
    expect(await matched("/abc", "DELETE")).toBeNull();
  });

  it("does not let a longer id path fall through to the id handler", async () => {
    expect(await matched("/7/force", "DELETE")).toBeNull();
  });
});

describe("no route takes an identity from the client", () => {
  /**
   * Read from the source, because the route table cannot show a request body.
   *
   * A notification id is not a capability: `setNotificationRead` and `deleteNotification`
   * both scope their `WHERE` by the session's user id, so naming somebody else's id
   * updates nothing. That design is worth exactly nothing if some handler starts reading a
   * `userId` off the body, which no behavioural test in this suite would notice — the
   * session-scoped query still runs, just with the wrong owner compared against it.
   */
  const source = stripComments(
    readFileSync(join(ROOT, "server/routes/notifications.ts"), "utf8"),
  );

  it("reads the file it is meant to be checking", () => {
    expect(source).toContain("notificationsRoute.get(");
    expect(source.length).toBeGreaterThan(2000);
  });

  it("reads no identity field off the request", () => {
    const forbidden = /\b(userId|sellerId|notificationId|recipientId|customerId)\b/;
    const offenders = codeLines(source).filter(
      (line) => forbidden.test(line) && line.includes("c.req"),
    );

    expect(offenders).toEqual([]);
  });

  it("passes the session user to every data-layer call", () => {
    // `user.id` rather than a bare `id`, so a future edit that adds a handler without it
    // shows up here rather than as a cross-account write.
    for (const call of [
      "listNotifications(user.id, query)",
      "countUnread(user.id)",
      "readNotificationPreferences(user.id)",
      "writeNotificationPreferences(user.id, input)",
      "markAllNotificationsRead(user.id)",
      "setNotificationRead(user.id, id, input.read)",
      "deleteNotification(user.id, id)",
    ]) {
      expect(source).toContain(call);
    }
  });

  it("declares the read id from the URL, not the body", () => {
    expect(source).toContain('Number(c.req.param("id"))');
  });
});

describe("preferences accept only channels the app can honour", () => {
  /**
   * The `preferencesSchema` declaration, sliced out of the source.
   *
   * Slicing rather than a global `.object({…})` match because the schema contains *nested*
   * objects, and a non-greedy `\}\)` match stops at the first closing brace — which lands
   * inside the `wishlist` group and silently drops every key after it. That mistake would
   * make the assertion below pass while checking half the schema.
   */
  const source = stripComments(
    readFileSync(join(ROOT, "server/routes/notifications.ts"), "utf8"),
  );
  const slice = source.match(/const preferencesSchema = z[\s\S]*?\.strict\(\);/)?.[0];

  it("finds the schema it is meant to be checking", () => {
    // If a reformat moves this declaration, fail loudly — a `slice` of `undefined` would
    // turn every assertion below into a pass over an empty string.
    expect(slice).toBeDefined();
  });

  /** Group keys, which sit one level in at four spaces of indentation. */
  const groupKeys = [...(slice ?? "").matchAll(/^ {4}([A-Za-z_][A-Za-z0-9_]*):/gm)].map(
    ([, key]) => key,
  );

  it("declares exactly the groups the settings form renders", () => {
    // The client's vocabulary. A group the server accepts but the form never renders is a
    // setting nobody can change; a group the form renders but the server refuses is a
    // checkbox that 400s when touched.
    const rendered = PREFERENCE_GROUPS.map((group) => group.key);
    expect(groupKeys.sort()).toEqual([...rendered].sort());
    expect(groupKeys.sort()).toEqual(Object.values(PREFERENCE_KEYS).sort());
  });

  it("refuses an email switch for the in-app-only groups", () => {
    // The assertion the brief cares about: only expose preferences the app can honour.
    // `wishlist` and `admin` have no email emitter, so accepting `email` would store a
    // value nothing reads — a control that looks saved and does nothing.
    for (const key of ["wishlist", "admin"]) {
      const line = (slice ?? "")
        .split("\n")
        .find((candidate) => candidate.trim().startsWith(`${key}:`));

      expect(line, `${key} group not found`).toBeDefined();
      expect(line).toContain("inApp");
      expect(line).not.toContain("email");
    }
  });

  it("offers an email switch for the four email-capable groups", () => {
    for (const key of ["orders", "rentals", "payments", "seller"]) {
      const line = (slice ?? "")
        .split("\n")
        .find((candidate) => candidate.trim().startsWith(`${key}:`));

      expect(line, `${key} group not found`).toBeDefined();
      // Shared `channelSchema`, which is where `email` is defined — one definition, four
      // groups, so the in-app-only groups cannot accidentally grow an email channel.
      expect(line).toContain("channelSchema");
    }
  });

  it("agrees with the form about which categories have an email switch", () => {
    const emailGroups = PREFERENCE_GROUPS.filter((group) => group.hasEmail).map((group) => group.key);
    expect(emailGroups.sort()).toEqual(["orders", "payments", "rentals", "seller"]);
  });

  it("makes the preferences schema strict, so a typo is a 400", () => {
    expect(slice).toContain(".strict()");
  });

  it("makes the shared channel schema strict", () => {
    // Otherwise `{ orders: { inApp: true, emial: false } }` would be accepted and the
    // misspelled channel silently dropped — the exact "looks saved, does nothing" bug.
    expect(source).toMatch(/const channelSchema = z[\s\S]*?\.strict\(\);/);
  });
});

describe("the list query degrades instead of throwing", () => {
  /**
   * These arrive as query strings on a URL the user can hand-edit, so a nonsense value
   * must produce a usable list. A `VALIDATION_ERROR` here would replace the notifications
   * page with an error screen because someone bookmarked `?page=abc`.
   */
  it("defaults a missing or nonsensical page to 1", () => {
    expect(parseNotificationListQuery({}).page).toBe(1);
    expect(parseNotificationListQuery({ page: "abc" }).page).toBe(1);
    expect(parseNotificationListQuery({ page: "0" }).page).toBe(1);
    expect(parseNotificationListQuery({ page: "-3" }).page).toBe(1);
    expect(parseNotificationListQuery({ page: "2.5" }).page).toBe(1);
  });

  it("accepts a positive integer page", () => {
    expect(parseNotificationListQuery({ page: "4" }).page).toBe(4);
  });

  it("only honours the three declared page sizes", () => {
    // An unbounded `pageSize` would let one request ask for the whole table.
    for (const size of NOTIFICATION_PAGE_SIZES) {
      expect(parseNotificationListQuery({ pageSize: String(size) }).pageSize).toBe(size);
    }
    expect(parseNotificationListQuery({ pageSize: "1000" }).pageSize).toBe(
      DEFAULT_NOTIFICATION_PAGE_SIZE,
    );
    expect(parseNotificationListQuery({ pageSize: "0" }).pageSize).toBe(
      DEFAULT_NOTIFICATION_PAGE_SIZE,
    );
  });

  it("normalises the category and drops one it does not know", () => {
    // Dropped rather than passed through: an unknown category must not silently match
    // nothing and present an empty feed as "you have no notifications".
    expect(parseNotificationListQuery({ category: "orders" }).category).toBe("ORDERS");
    expect(parseNotificationListQuery({ category: " NOPE " }).category).toBeNull();
    expect(parseNotificationListQuery({ category: "<script>" }).category).toBeNull();
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(parseNotificationListQuery({ category }).category).toBe(category);
    }
  });

  it("reads the unread filter from either spelling", () => {
    expect(parseNotificationListQuery({ unread: "true" }).unreadOnly).toBe(true);
    expect(parseNotificationListQuery({ unreadOnly: "true" }).unreadOnly).toBe(true);
    expect(parseNotificationListQuery({ unread: "false" }).unreadOnly).toBe(false);
    expect(parseNotificationListQuery({ unread: "1" }).unreadOnly).toBe(false);
  });
});
