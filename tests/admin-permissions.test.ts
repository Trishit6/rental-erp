import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY, type SessionUser } from "../server/lib/auth";
import { Router, compilePrefix } from "../server/lib/http";
import { primeAccessCache } from "../server/lib/permissions";
import {
  PERMISSION_CATALOGUE,
  PERMISSION_KEYS,
  ROLE_PERMISSION_GRANTS,
} from "../server/lib/permission-catalogue";
import { PERMISSION_KEY_PATTERN } from "../server/lib/enums";
import { ADMIN_ROUTE_PERMISSIONS, adminRoute } from "../server/routes/admin";
import { startRouter, type Harness } from "./support/http-harness";

/**
 * PROMPT 22 — every `/api/admin` route is behind a permission, and the permission
 * actually decides.
 *
 * ## Two different claims
 *
 * Hiding a button is UX. The claim this file makes is stronger and testable
 * without a database:
 *
 *  1. **Coverage.** Every route the admin router registers is matched by an entry
 *     in `ADMIN_ROUTE_PERMISSIONS`. This is the failure mode a hand-maintained map
 *     has — a new endpoint added with no gate fails open — and it is caught by
 *     comparing the map against `adminRoute.routes()`, not by reading either by
 *     eye.
 *  2. **Enforcement.** A staff account holding a role's grant set is refused on a
 *     route its role does not cover, and admitted to one it does. `requirePermission`
 *     reads the resolved access set, so the suite primes the cache with exactly
 *     what the identity joins would have produced.
 *
 * The existing `admin-authorization.test.ts` proves the coarse gate refuses
 * everyone without a session; this file proves the *fine* gate is real once a
 * session exists.
 */

/** The admin router, mounted the way `server/index.ts` mounts it. */
function routerAs(): Router {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    c.set(SESSION_USER_KEY, {
      id: 42,
      // Coarse `ADMIN`: exactly how the seed marks every staff account. The
      // sub-role that distinguishes SUPPORT from FINANCE lives in `user_roles`,
      // which is the set primed below.
      role: "ADMIN",
      name: "Test Staff",
      email: "staff@revaro.local",
      verified: true,
      avatarUrl: null,
      status: "ACTIVE",
      mustChangePassword: false,
      mustEnrollMfa: false,
      mfaEnabled: true,
    } satisfies SessionUser);
    await next();
  });
  router.route("/api/admin", adminRoute);
  return router;
}

let harness: Promise<Harness>;

function as(role: keyof typeof ROLE_PERMISSION_GRANTS) {
  primeAccessCache(42, {
    roles: new Set([role]),
    permissions: new Set(ROLE_PERMISSION_GRANTS[role]),
  });
  return harness;
}

beforeEach(() => {
  harness ??= startRouter(routerAs());
});

afterAll(async () => {
  if (harness) await (await harness).close();
});

/* ------------------------------ the vocabulary ------------------------------ */

describe("the permission catalogue", () => {
  it("uses the `resource.action` shape the database CHECK requires", () => {
    for (const key of PERMISSION_KEYS) {
      expect(key, `"${key}" is not a valid permission key`).toMatch(PERMISSION_KEY_PATTERN);
    }
  });

  it("has no duplicate key", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it("only ever grants a role a key that exists", () => {
    // The seed would throw for an unknown key, but only on a real re-seed. This
    // catches the typo at test time, where it is a red suite instead of a failed
    // production seed.
    for (const [role, keys] of Object.entries(ROLE_PERMISSION_GRANTS)) {
      for (const key of keys) {
        expect(PERMISSION_KEYS, `${role} grants unknown permission "${key}"`).toContain(key);
      }
    }
  });

  it("gives SUPER_ADMIN every key and nobody else rbac.manage", () => {
    expect(new Set(ROLE_PERMISSION_GRANTS.SUPER_ADMIN)).toEqual(new Set(PERMISSION_KEYS));
    for (const role of ["ADMIN", "SUPPORT", "FINANCE", "MODERATOR", "CONTENT_MANAGER"] as const) {
      expect(ROLE_PERMISSION_GRANTS[role]).not.toContain("rbac.manage");
    }
  });

  it("keeps the coarse account kinds out of the staff vocabulary", () => {
    // `USER` and `SELLER` hold no staff permission on purpose — their authority is
    // `users.role` and ownership, not a grant.
    expect(ROLE_PERMISSION_GRANTS.USER).toEqual([]);
    expect(ROLE_PERMISSION_GRANTS.SELLER).toEqual([]);
  });
});

/* -------------------------------- coverage ---------------------------------- */

describe("every admin route is gated", () => {
  /**
   * `/me` is the one deliberate exemption: a staff member's own grant set has to
   * be readable for the sidebar to filter, and it exposes nothing else.
   */
  const EXEMPT = new Set(["/me"]);

  it("registers at least the endpoints this test maps (so it is not vacuous)", () => {
    expect(adminRoute.routes().length).toBeGreaterThan(30);
  });

  it("covers every registered route with a permission", () => {
    for (const route of adminRoute.routes()) {
      if (EXEMPT.has(route.path)) continue;
      const covered = ADMIN_ROUTE_PERMISSIONS.some(
        (entry) => entry.method === route.method && compilePrefix(entry.path).test(route.path),
      );
      expect(covered, `${route.method} ${route.path} has no entry in ADMIN_ROUTE_PERMISSIONS`).toBe(
        true,
      );
    }
  });

  it("names only permissions that exist", () => {
    const catalogueKey = new Map(PERMISSION_CATALOGUE.map((entry) => [entry.key, entry]));
    for (const entry of ADMIN_ROUTE_PERMISSIONS) {
      expect(
        catalogueKey.has(entry.permission),
        `${entry.method} ${entry.path} requires unknown "${entry.permission}"`,
      ).toBe(true);
    }
  });

  it("gates the RBAC surface with rbac.manage and nothing else", () => {
    const gates = ADMIN_ROUTE_PERMISSIONS.filter((entry) => entry.permission === "rbac.manage");
    const paths = gates.map((entry) => `${entry.method} ${entry.path}`).sort();
    expect(paths).toEqual([
      "DELETE /roles",
      "GET /permissions",
      "GET /roles",
      "GET /users/:id{[0-9]+}/roles",
      "PATCH /roles",
      "POST /roles",
      "PUT /users",
    ]);
  });
});

/* ------------------------------ live enforcement ---------------------------- */

describe("a SUPPORT account is admitted to tickets and refused everywhere else", () => {
  it("reads its own grants, so the sidebar can filter", async () => {
    const app = await (await as("SUPPORT")).request("/api/admin/me");
    expect(app.status).toBe(200);
    const body = (await app.json()) as { data: { permissions: string[]; roles: string[] } };
    expect(body.data.roles).toContain("SUPPORT");
    expect(body.data.permissions).toContain("support.view");
    expect(body.data.permissions).not.toContain("rbac.manage");
  });

  it("is refused on the role editor", async () => {
    // The acceptance case from the brief, verbatim: a SUPPORT user gets a 403 on
    // the role endpoints even when the request is forged rather than clicked.
    const app = await as("SUPPORT");
    expect((await app.request("/api/admin/roles")).status).toBe(403);
    expect((await app.request("/api/admin/permissions")).status).toBe(403);
  });

  it("is refused on product moderation", async () => {
    const app = await as("SUPPORT");
    const response = await app.request("/api/admin/products/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED" }),
    });
    expect(response.status).toBe(403);
  });

  it("reaches the ticket queue", async () => {
    // Not 403 is the whole claim: the gate opened and the handler ran. The handler
    // then fails on the database this suite does not have, which is a different
    // failure and says nothing about access control.
    const app = await as("SUPPORT");
    const response = await app.request("/api/admin/support/tickets");
    expect(response.status).not.toBe(403);
  });
});

describe("RBAC is SUPER_ADMIN-only, one step above ADMIN", () => {
  it("refuses an ADMIN on the role editor", async () => {
    const app = await as("ADMIN");
    expect((await app.request("/api/admin/roles")).status).toBe(403);
  });

  it("admits a SUPER_ADMIN", async () => {
    const app = await as("SUPER_ADMIN");
    const response = await app.request("/api/admin/roles");
    expect(response.status).not.toBe(403);
  });

  it("still gates a plain ADMIN behind the permission on a route it lacks nothing for", async () => {
    // ADMIN holds `products.moderate`, so the same request that a SUPPORT account
    // is refused reaches the handler. Without this, "always 403" would satisfy the
    // SUPPORT assertions above.
    const app = await as("ADMIN");
    const response = await app.request("/api/admin/products/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED" }),
    });
    expect(response.status).not.toBe(403);
  });
});

/* ------------------------- PROMPT 26: content + catalogue ------------------- */

describe("content and the taxonomy are gated by their own permissions", () => {
  it("admits a CONTENT_MANAGER to the CMS", async () => {
    const app = await as("CONTENT_MANAGER");
    // Not 403 is the claim: the gate opened and the handler ran (it then fails on
    // the database this suite does not have, which is a different failure).
    expect((await app.request("/api/admin/cms/catalogue")).status).not.toBe(403);
    expect((await app.request("/api/admin/cms/banners")).status).not.toBe(403);
    expect((await app.request("/api/admin/cms/blocks")).status).not.toBe(403);
  });

  it("admits a CONTENT_MANAGER to category management", async () => {
    const app = await as("CONTENT_MANAGER");
    const response = await app.request("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test category" }),
    });
    expect(response.status).not.toBe(403);
  });

  it("refuses a SUPPORT account on the CMS and the taxonomy", async () => {
    const app = await as("SUPPORT");
    expect((await app.request("/api/admin/cms/banners")).status).toBe(403);
    expect((await app.request("/api/admin/cms/catalogue")).status).toBe(403);
    expect(
      (
        await app.request("/api/admin/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test category" }),
        })
      ).status,
    ).toBe(403);
  });

  it("refuses a CONTENT_MANAGER on product moderation", async () => {
    const app = await as("CONTENT_MANAGER");
    const response = await app.request("/api/admin/products/bulk-delete", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1], reason: "test" }),
    });
    expect(response.status).toBe(403);
  });
});
