import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import { messagesRoute } from "../server/routes/messages";
import { startRouter, type Harness } from "./support/http-harness";
import { codeLines, stripComments } from "./support/source-scanning";

/**
 * The messaging API's authorization and its route table.
 *
 * ## The property under test
 *
 * Private messages are the one surface in this application where a mistake leaks
 * something nobody can un-leak: a customer's messages, read by another customer. So
 * there are two independent things to get right, and this file covers both.
 *
 * **The session gate.** `messagesRoute.use("*", requireUser)` runs before routing, so
 * an anonymous call to *any* conversations path — including one that does not exist —
 * answers 401. If it answered 404 instead, the API would be a directory of who is
 * messaging whom, to anyone who cared to enumerate it.
 *
 * **There is no way to name a participant.** This is the design of the feature rather
 * than a check inside it: no route accepts a `userId`, `sellerId`, `customerId` or
 * `recipientId` anywhere in its body. The counterparty of a new thread is resolved from
 * `products.sellerId` and the recipient of a message from `conversationParticipants`, so
 * the question "can this caller reach that conversation" is never asked of the client's
 * input — there is no field in which to smuggle an answer. A `.strict()` schema turns
 * the *absence* into an enforced property: a client that sent a `sellerId` out of habit
 * gets a 400 naming the field, instead of believing it addressed somebody.
 *
 * ## What this file cannot check
 *
 * `requireParticipation` — the refusal that answers 403 for a conversation the caller
 * is not in — needs a database, and this suite has none. What is checked here is that
 * every route that *takes* a conversation id is registered, and that the ids arrive
 * from a URL the server then resolves itself. The data-layer refusal is covered by
 * `server/lib/messaging.ts`'s own doc comment and by the live API.
 */

const ROOT = join(__dirname, "..");

/**
 * Every conversations endpoint, plus two that do not exist — as full request paths.
 *
 * There are two path vocabularies here and conflating them makes every assertion in this
 * file pass vacuously, which is how this suite was wrong twice before being right:
 *
 *  - **Declarations** in `server/routes/messages.ts` are relative to the mount, so the
 *    list is `GET "/"`, `GET "/context"`, `POST "/:id{[0-9]+}/messages"`. Writing
 *    `/conversations/1/messages` there resolves to a URL no client calls.
 *  - **Requests** carry the mount, because `Router.route` strips it for the sub-router
 *    (`server/lib/http.ts` passes `prefixText` into `toExpress`) but the test harness
 *    sends the literal path it is given.
 *
 * So these paths are `/api/conversations/...` while the declarations they exercise are
 * `/...`. A trailing slash is deliberate on the collection root: it is how the client
 * addresses it, and `normalizePrefix` is what makes `/api/conversations` and
 * `/api/conversations/` agree.
 */
const ENDPOINTS: [method: string, path: string][] = [
  ["GET", "/api/conversations/"],
  ["GET", "/api/conversations/context"],
  ["GET", "/api/conversations/1/messages"],
  ["GET", "/api/conversations/not-a-number/messages"],
  ["GET", "/api/conversations/99999/messages"],
  ["POST", "/api/conversations/"],
  ["POST", "/api/conversations/1/read"],
  ["POST", "/api/conversations/1/messages"],
  ["PATCH", "/api/conversations/1"],
  ["DELETE", "/api/conversations/1"],
  // Not real endpoints. The gate runs before routing, so an anonymous caller cannot
  // probe which paths exist by watching for a 404 instead of a 401.
  ["GET", "/api/conversations/does-not-exist"],
  ["POST", "/api/conversations/1/participants"],
];

/**
 * The real router at its real mount point, with the session explicitly empty.
 *
 * `null` is set rather than left absent because that is what `attachUser` publishes for
 * a cookie-less request (`server/lib/auth.ts`); an anonymous caller here should be
 * indistinguishable from one reaching the API with no cookie.
 */
function anonymousRouter(): Router {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    c.set(SESSION_USER_KEY, null);
    await next();
  });
  router.route("/api/conversations", messagesRoute);
  return router;
}

describe("the messaging API refuses anonymous callers", () => {
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
        body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify({ body: "hi" }),
      });

      expect(res.status).toBe(401);
      // A 404 here would confirm the path exists; the body must not leak that either way.
      const payload = (await res.json()) as { error?: { code?: string } };
      expect(payload.error?.code).toBe("UNAUTHENTICATED");
    });
  }
});

describe("the route table answers every literal path with its own handler", () => {
  /**
   * The bug class from `tests/review-routes.test.ts`, replayed for this router.
   *
   * `GET /conversations/context` sits next to `GET /conversations/:id{[0-9]+}/messages`.
   * The digit constraint already keeps them apart, but the order is what makes it true
   * rather than merely true today — so the real paths are re-registered on a throwaway
   * router whose handlers only echo which pattern matched, and the matcher is asked.
   */
  const replay = (() => {
    const router = new Router();
    for (const route of messagesRoute.routes()) {
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

  it("routes the list to /", async () => {
    expect(await matched("/")).toBe("/");
  });

  it("routes /context to its own handler, not to a numeric id", async () => {
    expect(await matched("/context")).toBe("/context");
  });

  it("routes a transcript to its handler", async () => {
    expect(await matched("/7/messages")).toBe("/:id{[0-9]+}/messages");
  });

  it("routes the read marker to its handler", async () => {
    expect(await matched("/7/read", "POST")).toBe("/:id{[0-9]+}/read");
  });

  it("does not route a non-numeric conversation id", async () => {
    // The constraint is what stops `/context` from ever being read as an id, and what
    // stops a client typo from becoming a query for conversation `NaN`.
    expect(await matched("/abc/messages")).toBeNull();
  });

  it("registers both message verbs on the same path", async () => {
    expect(await matched("/7/messages")).toBe("/:id{[0-9]+}/messages");
    expect(await matched("/7/messages", "POST")).toBe("/:id{[0-9]+}/messages");
  });
});

describe("no route accepts a participant from the client", () => {
  /**
   * Read from the source, not the table.
   *
   * The route table shows *paths*; it cannot show a request body. This is the assertion
   * that has to look at code — and it is the one that matters most, because a route
   * taking a `userId` would still pass every other test in this file: it would still
   * 401 for anonymous callers, and it would still refuse non-participants in the data
   * layer *if* that check exists — it would just be a door that opens for whoever names
   * the right number.
   */
  const source = readFileSync(join(ROOT, "server/routes/messages.ts"), "utf8");
  const code = stripComments(source);

  it("reads the file it is meant to be checking", () => {
    expect(source).toContain("messagesRoute.post(");
    expect(source.length).toBeGreaterThan(2000);
  });

  it("reads no recipient-shaped field off the request", () => {
    /*
     * The property, stated as narrowly as it can be without being vacuous.
     *
     * A blanket "the word `sellerId` never appears in this file" would be *false*, and a
     * test asserting something false gets deleted by the next legitimate use — which here
     * would be `const { sellerId } = await assertCanContactSeller(...)`, the line that
     * makes the whole feature safe. Those names are supposed to appear; they are just
     * never allowed to arrive from the client.
     *
     * So the assertion is directional: a recipient-shaped identifier may be *computed*,
     * never *received*. A line that touches `c.req` while naming one of these is exactly
     * the smuggling path, and there is none.
     */
    const forbidden = /\b(sellerId|userId|customerId|recipientId|participantId|toUserId|fromUserId)\b/;
    const offenders = codeLines(code).filter((line) => forbidden.test(line) && line.includes("c.req"));

    expect(offenders).toEqual([]);
  });

  it("accepts only the four documented fields, in any schema", () => {
    /*
     * The allowlist is on the schema *keys*, which is stricter than scanning for forbidden
     * names: a recipient id can reach a request body under a name nobody guessed. Every
     * `.object({…})` body in this file is extracted and its keys compared.
     *
     * This is the assertion that actually closes the door. `productId`/`orderId`/`rentalId`
     * name *things*, and each is re-verified server-side; `body` is text; `id` is the
     * conversation id already taken from the URL path. There is no key here that names a
     * person, so there is no value a client can supply that the server would mistake for a
     * participant.
     */
    const allowed = new Set(["productId", "body", "orderId", "rentalId", "id"]);
    const declared = [...code.matchAll(/\.object\(\{([\s\S]*?)\}\)/g)].flatMap(([, body]) =>
      [...body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map(([, key]) => key),
    );

    // Two schemas declare a body (`sendMessageSchema`, `startConversationSchema`).
    expect(declared.length).toBeGreaterThanOrEqual(6);
    expect([...declared.filter((key) => !allowed.has(key))]).toEqual([]);
  });

  it("resolves every recipient from the server, not from the caller", () => {
    // Both recipient lookups are function calls whose first argument is derived data —
    // the conversation, and the listing. The positive form of the assertion above: the
    // names exist, and they are bound to the outputs of the guards.
    expect(code).toContain("otherParticipantId(id, user.id)");
    expect(code).toContain("assertCanContactSeller(input.productId, user)");
  });

  it("starts a conversation from a product, not from a person", () => {
    // The counterparty is whatever `products.sellerId` says it is. If this ever becomes
    // a seller id, the feature stops being a marketplace messaging feature and becomes
    // an open one with a storefront attached.
    expect(source).toContain("productId: z.number().int().positive()");
    expect(source).toContain("assertCanContactSeller(input.productId, user)");
  });

  it("derives the message recipient from the conversation, not from the request", () => {
    expect(source).toContain("otherParticipantId(id, user.id)");
  });

  it("makes every body schema strict, so an unexpected key is a 400", () => {
    // `.strict()` is what turns "the client sent a field I ignore" into "the client
    // sent a field I refuse". Two schemas here declare bodies.
    const bodies = source.match(/z\s*\n?\s*\.object\(/g) ?? [];
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/\.strict\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
