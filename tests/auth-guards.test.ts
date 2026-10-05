import { describe, expect, it, vi } from "vitest";
import { homeFor, requireAdmin, requireAuth, requireGuest, requireSeller, safeRedirect } from "../src/lib/auth/guards";
import type { User } from "../src/features/auth/types";

/**
 * The route guards: who gets sent where, and why.
 *
 * ## What these are and are not
 *
 * A `beforeLoad` guard is *not* authorization. Hiding a page from someone who typed its URL
 * is a courtesy; the enforcement lives in `requireUser`/`requireAdmin`/`requireSeller` on
 * the server, which is what the admin-authorization suite asserts. What these tests pin
 * down is the part a server cannot do for us — the *navigation*: that a signed-out visitor
 * ends up at login rather than at an error page, that they are returned to where they were
 * going, and that a customer who follows an admin link is not bounced into a loop.
 *
 * The two failures worth naming:
 *
 *  - **Losing the destination.** `/orders?ref=1` and `/orders` are different pages. A guard
 *    that remembers only the pathname drops the user into an unfiltered list and the flow
 *    looks broken even though it "worked".
 *  - **Redirect loops.** A signed-in customer sent to `/login` is caught by `requireGuest`,
 *    sent to `/dashboard`, and refused again by `requireSeller` — an infinite bounce. Every
 *    guard below has to be read with that in mind.
 */

const redirect = vi.fn((options: unknown) => {
  const thrown = new Error("redirect") as Error & { options?: unknown };
  thrown.options = options;
  return thrown;
});

vi.mock("@tanstack/react-router", () => ({
  redirect: (options: unknown) => {
    throw redirect(options);
  },
}));

function user(role: User["role"]): User {
  return {
    id: 1,
    name: "Asha Rao",
    email: "asha@example.com",
    role,
    verified: true,
    avatarUrl: null,
  };
}

/** Runs a guard and returns the redirect it threw, or `null` if it let the route render. */
function run(guard: (args: never) => unknown, args: unknown): Record<string, unknown> | null {
  try {
    guard(args as never);
    return null;
  } catch (thrown) {
    const options = (thrown as { options?: Record<string, unknown> }).options;
    return options ?? { threw: String(thrown) };
  }
}

describe("the destination a user is returned to", () => {
  it("keeps a path", () => {
    expect(safeRedirect("/profile", "/")).toBe("/profile");
  });

  it("keeps a path with its query string", () => {
    // The difference between landing on the results the user was looking at and landing on
    // an unfiltered catalogue.
    expect(safeRedirect("/browse?search=drill&mode=rent", "/")).toBe(
      "/browse?search=drill&mode=rent",
    );
  });

  it("falls back for anything that could leave the site", () => {
    // `redirect` reaches the login page through the URL, so it is whatever a link chose to
    // put there. Handing `https://evil.example` to `navigate({ to })` after a real sign-in is
    // a textbook open redirect: the user authenticates on a genuine page and is then
    // forwarded somewhere that can imitate it.
    const hostile = [
      "https://evil.example/steal",
      "http://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "profile",
      "",
      null,
      undefined,
      42,
      {},
    ];
    for (const value of hostile) {
      expect(safeRedirect(value, "/"), String(value)).toBe("/");
    }
  });
});

describe("where a signed-in user belongs", () => {
  it("sends a seller to their workspace and a customer to their profile", () => {
    // `/dashboard` is the *seller* workspace: its pages read `/api/seller/*`, which answers
    // 403 for a customer. A single destination for everyone meant every new sign-in and
    // every customer who opened /login by mistake landed on a page that could not load.
    expect(homeFor(user("SELLER"))).toBe("/dashboard");
    expect(homeFor(user("ADMIN"))).toBe("/dashboard");
    expect(homeFor(user("USER"))).toBe("/profile");
    expect(homeFor(null)).toBe("/profile");
  });
});

describe("requireAuth", () => {
  it("lets a signed-in user through", () => {
    expect(run(requireAuth, { context: { user: user("USER") } })).toBeNull();
  });

  it("sends a signed-out visitor to login with no destination to remember", () => {
    const options = run(requireAuth, { context: { user: null } });

    expect(options?.to).toBe("/login");
    expect(options?.search).toBeUndefined();
  });

  it("remembers where they were going, query string and all", () => {
    const options = run(requireAuth, {
      context: { user: null },
      location: { pathname: "/browse", searchStr: "?search=drill" },
    });

    expect(options?.to).toBe("/login");
    expect(options?.search).toEqual({ redirect: "/browse?search=drill" });
  });

  it("waits rather than guessing while the session is still resolving", () => {
    // Redirecting on an unresolved session is what signs a real user out: the guard reads
    // `user === null`, concludes "signed out", and sends them to login mid-visit.
    const options = run(requireAuth, { context: { user: null, loading: true } });

    expect(options?.to).toBe("/auth-check");
    expect(options?.replace).toBe(true);
  });
});

describe("requireAdmin", () => {
  it("lets an admin through", () => {
    expect(run(requireAdmin, { context: { user: user("ADMIN") } })).toBeNull();
  });

  it.each(["USER", "SELLER"] as const)("refuses a %s", (role) => {
    const options = run(requireAdmin, { context: { user: user(role) } });

    expect(options?.replace).toBe(true);
    expect(options?.to).toBe(role === "SELLER" ? "/dashboard" : "/profile");
  });

  it("never sends a signed-in non-admin to the login page", () => {
    // The loop this prevents: `/admin` → `/login` → `requireGuest` sees a user → `/` or
    // `/dashboard` → … with the user bouncing and the destination lost each time.
    const options = run(requireAdmin, { context: { user: user("USER") } });
    expect(options?.to).not.toBe("/login");
  });

  it("still sends an anonymous visitor to login", () => {
    expect(run(requireAdmin, { context: { user: null } })?.to).toBe("/login");
  });
});

describe("requireSeller", () => {
  it.each(["SELLER", "ADMIN"] as const)("lets a %s through", (role) => {
    expect(run(requireSeller, { context: { user: user(role) } })).toBeNull();
  });

  it("offers onboarding to a customer, carrying the destination", () => {
    const options = run(requireSeller, {
      context: { user: user("USER") },
      location: { pathname: "/dashboard/wallet" },
    });

    expect(options?.to).toBe("/dashboard/become-a-seller");
    expect(options?.search).toEqual({ redirect: "/dashboard/wallet" });
  });

  it("sends a signed-out visitor to login instead of to onboarding", () => {
    // Onboarding is a form that requires a session. Sending a stranger there produces a
    // dead end with a "become a seller" heading and no way forward.
    expect(run(requireSeller, { context: { user: null } })?.to).toBe("/login");
  });
});

describe("requireGuest", () => {
  it("lets a signed-out visitor reach login and register", () => {
    expect(run(requireGuest, { context: { user: null } })).toBeNull();
  });

  it("sends a signed-in customer to their profile, not the seller workspace", () => {
    const options = run(requireGuest, { context: { user: user("USER") } });

    expect(options?.to).toBe("/profile");
    expect(options?.replace).toBe(true);
  });

  it("sends a signed-in seller to their workspace", () => {
    expect(run(requireGuest, { context: { user: user("SELLER") } })?.to).toBe("/dashboard");
  });

  it("cannot produce a loop: it never redirects to login or register", () => {
    // Both of those routes are `requireGuest`-guarded, so redirecting to either from here
    // would be an infinite bounce for every signed-in user.
    for (const role of ["USER", "SELLER", "ADMIN"] as const) {
      const to = run(requireGuest, { context: { user: user(role) } })?.to;
      expect([to]).not.toContain("/login");
      expect([to]).not.toContain("/register");
    }
  });
});

describe("no guard sends a signed-in user to a guest-only page", () => {
  // The property that makes the set of redirects safe to reason about: once you are
  // signed in, nothing routes you back to /login or /register, so there is no pair of
  // guards that can hand the user back and forth.
  const guards = [
    [requireAuth, { user: user("USER") }],
    [requireAdmin, { user: user("USER") }],
    [requireSeller, { user: user("SELLER") }],
    [requireGuest, { user: user("USER") }],
    [requireGuest, { user: user("SELLER") }],
  ] as const;

  for (const [guard, context] of guards) {
    it(`${guard.name} keeps a signed-in user out of the guest pages`, () => {
      const to = run(guard as (args: never) => unknown, { context } as never)?.to;
      expect([to]).not.toContain("/login");
      expect([to]).not.toContain("/register");
    });
  }
});