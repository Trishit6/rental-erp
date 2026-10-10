import { afterAll, describe, expect, it } from "vitest";
import { HttpError, onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY, type SessionUser } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import {
  accessGrants,
  accessHasRole,
  assertOwnership,
  requireMfaEnrolment,
} from "../server/lib/permissions";
import { startRouter, type Harness } from "./support/http-harness";

/**
 * The RBAC surface that can be exercised without a database.
 *
 * `resolveAccess` (the DB half) is covered by the schema + seed tests and the
 * live API checks; the pure decision logic and the staff-MFA gate do not need a
 * connection and are asserted here. The gate path for coarse `ADMIN` sessions
 * never touches the database, which is exactly what makes it safe to run in the
 * no-DB suite.
 */

function session(mfaEnabled: boolean): SessionUser {
  return {
    id: 7,
    role: "ADMIN",
    name: "Admin Test",
    email: "admin@revaro.local",
    verified: true,
    avatarUrl: null,
    status: "ACTIVE",
    mustChangePassword: false,
    mustEnrollMfa: false,
    mfaEnabled,
  };
}

function gateRouter(mfaEnabled: boolean): Router {
  const protectedRouter = new Router();
  protectedRouter.use("*", requireMfaEnrolment());
  protectedRouter.get("/secret", (c) => c.json({ success: true, data: { granted: true } }));

  const outer = new Router();
  outer.onError(onErrorHandler);
  outer.use(async (c, next) => {
    c.set(SESSION_USER_KEY, session(mfaEnabled));
    await next();
  });
  outer.route("/", protectedRouter);
  return outer;
}

describe("permission decision helpers", () => {
  it("SUPER_ADMIN is unrestricted", () => {
    const access = { roles: new Set(["SUPER_ADMIN"]), permissions: new Set() };
    expect(accessGrants(access, "orders.refund")).toBe(true);
    expect(accessGrants(access, "rbac.manage")).toBe(true);
    expect(accessGrants(access, "does.not.exist")).toBe(true);
  });

  it("a permission grant answers exactly that key", () => {
    const access = { roles: new Set(["FINANCE"]), permissions: new Set(["orders.refund"]) };
    expect(accessGrants(access, "orders.refund")).toBe(true);
    expect(accessGrants(access, "orders.view")).toBe(false);
    expect(accessGrants(access, "rbac.manage")).toBe(false);
  });

  it("an empty access set grants nothing", () => {
    const access = { roles: new Set<string>(), permissions: new Set<string>() };
    expect(accessGrants(access, "anything.at.all")).toBe(false);
    expect(accessHasRole(access, "SUPPORT")).toBe(false);
  });

  it("role membership is by name", () => {
    const access = { roles: new Set(["SUPPORT", "USER"]), permissions: new Set() };
    expect(accessHasRole(access, "SUPPORT")).toBe(true);
    expect(accessHasRole(access, "ADMIN")).toBe(false);
  });
});

describe("assertOwnership", () => {
  function user(role: SessionUser["role"], id: number): SessionUser {
    return {
      id,
      role,
      name: "N",
      email: "n@revaro.local",
      verified: true,
      avatarUrl: null,
      status: "ACTIVE",
      mustChangePassword: false,
      mustEnrollMfa: false,
      mfaEnabled: true,
    };
  }

  it("allows the owner", () => {
    expect(() => assertOwnership(user("USER", 5), 5)).not.toThrow();
  });

  it("returns 404 (not 403) for someone else's row", () => {
    try {
      assertOwnership(user("USER", 5), 7);
      expect.unreachable("assertOwnership should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(404);
      expect((error as HttpError).code).toBe("NOT_FOUND");
    }
  });

  it("let an administrator through (the admin self-service exception)", () => {
    expect(() => assertOwnership(user("ADMIN", 5), 7)).not.toThrow();
  });
});

describe("staff MFA gate (requireMfaEnrolment)", () => {
  let harness: Harness;

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it("blocks a staff session whose MFA is off", async () => {
    harness ??= await startRouter(gateRouter(false));
    const response = await harness.request("/secret");
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MFA_ENROLMENT_REQUIRED");
  });

  it("lets a staff session with MFA enabled through", async () => {
    if (!harness) harness = await startRouter(gateRouter(false));
    // A second router with the flag on — the same harness can't flip the flag.
    const enabled = await startRouter(gateRouter(true));
    try {
      const response = await enabled.request("/secret");
      expect(response.status).toBe(200);
    } finally {
      await enabled.close();
    }
  });
});