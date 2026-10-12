import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY } from "../server/lib/auth";
import { blockUser, isBlockedEitherWay } from "../server/lib/blocks";
import { Router } from "../server/lib/http";
import { usersRoute } from "../server/routes/social";
import { startRouter, type Harness } from "./support/http-harness";
import { codeLines, stripComments } from "./support/source-scanning";

/**
 * The account-blocking API.
 *
 * ## The property under test
 *
 * A block is a private decision. Two things have to hold, and this file covers
 * both ends of them:
 *
 *  - **The actor is the session, never the request.** There is no `blockerId`
 *    anywhere in a body or a path. `blockUser(user.id, id)` takes the blocker from
 *    `requireUser` and only the *target* from the URL, so a caller cannot place a
 *    block on someone else's behalf. The source scan below is what pins that.
 *  - **An anonymous caller learns nothing.** Every block path refuses before
 *    routing, so the API is not a directory of who blocked whom.
 *
 * ## What this file cannot check
 *
 * The mutual refusal itself (`isBlockedEitherWay` answering true across either
 * direction of the pair) needs a database, and this suite has none. The pure
 * guards that fire before any query — self-block, and the equal-id short circuit —
 * are checked directly, and the query itself is covered by `pnpm db:verify:constraints`
 * against a live MariaDB.
 */

const ROOT = join(__dirname, "..");

/**
 * Every users endpoint, plus the literal collection root. Paths carry the
 * `/api/users` mount because the harness sends literal URLs while the router
 * declarations are relative to it.
 */
const ENDPOINTS: [method: string, path: string][] = [
  ["GET", "/api/users/blocked"],
  ["POST", "/api/users/1/block"],
  ["DELETE", "/api/users/1/block"],
  ["GET", "/api/users/me"],
];

function anonymousRouter(): Router {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    c.set(SESSION_USER_KEY, null);
    await next();
  });
  router.route("/api/users", usersRoute);
  return router;
}

describe("the blocking API refuses anonymous callers", () => {
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
        body: method === "POST" ? JSON.stringify({ reason: "hi" }) : undefined,
      });

      expect(res.status).toBe(401);
      const payload = (await res.json()) as { error?: { code?: string } };
      expect(payload.error?.code).toBe("UNAUTHENTICATED");
    });
  }
});

describe("the route table keeps literal and parameterised paths apart", () => {
  const replay = (() => {
    const router = new Router();
    for (const route of usersRoute.routes()) {
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

  it("routes the blocked list to its own handler, not to a parameterised id", async () => {
    expect(await matched("/blocked")).toBe("/blocked");
  });

  it("routes block and unblock to the same constrained path", async () => {
    expect(await matched("/7/block", "POST")).toBe("/:id{[0-9]+}/block");
    expect(await matched("/7/block", "DELETE")).toBe("/:id{[0-9]+}/block");
  });

  it("does not route a non-numeric id", async () => {
    expect(await matched("/abc/block", "POST")).toBeNull();
  });

  it("keeps the profile endpoint where it was", async () => {
    expect(await matched("/me")).toBe("/me");
  });
});

describe("the pure guards fire before any query", () => {
  it("refuses a self-block", async () => {
    await expect(blockUser(5, 5)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("treats a comparison of the same account as unblocked, without a query", async () => {
    // The equal-id short circuit is what stops a self-pair from ever reaching SQL.
    await expect(isBlockedEitherWay(5, 5)).resolves.toBe(false);
  });
});

describe("no route accepts the blocker from the client", () => {
  const source = readFileSync(join(ROOT, "server/routes/social.ts"), "utf8");
  const code = stripComments(source);

  it("reads the file it is meant to be checking", () => {
    expect(source).toContain("usersRoute.post(");
    expect(source.length).toBeGreaterThan(2000);
  });

  it("takes the blocker from the session and only the target from the path", () => {
    expect(code).toContain("blockUser(user.id, id");
    expect(code).toContain("unblockUser(user.id, id");
  });

  it("reads no blocker- or blocked-shaped field off the request", () => {
    const forbidden = /\b(blockerId|blockedId|actorId|fromUserId|toUserId)\b/;
    const offenders = codeLines(code).filter(
      (line) => forbidden.test(line) && line.includes("c.req"),
    );
    expect(offenders).toEqual([]);
  });

  it("rate-limits both state-changing block routes", () => {
    const guarded = code.match(/guarded\("social\.block"/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(2);
  });
});
