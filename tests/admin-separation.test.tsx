import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { RootLayout } from "@/routes/__root";
import { requireAdmin } from "@/lib/auth/guards";
import { isSellerRole } from "@/features/auth/types";

/**
 * The admin workspace is separate from the customer-facing site.
 *
 * ## What "separate" has to mean to be worth testing
 *
 * Not "the admin pages look different". The requirement is that `/admin` is not part
 * of the storefront: no site header, no footer, no floating rail, no go-to-top, no
 * chatbot, no cart drawer. Each of those is a way *out* of the workspace, and the
 * header in particular offers navigation into pages an administrator should reach
 * deliberately rather than by accident.
 *
 * ## The bug this guards is a prefix match, not a missing condition
 *
 * The tempting implementation is `pathname.startsWith("/admin")`, and it is wrong in
 * the direction that is easy to miss: a customer page at `/admin-guide` — or any
 * future page whose slug begins with "admin" — would lose its header and footer and
 * have no way to navigate anywhere. That is a broken storefront, not a stricter
 * admin, so the comparison has to be on whole path segments. Both directions are
 * asserted below.
 *
 * ## What this is *not*
 *
 * None of it is access control. `requireAdmin` here is the friendly half that stops
 * the shell rendering; the authoritative half is `requireAdmin` in
 * `server/routes/admin.ts`, which is tested against the real server. Hiding chrome is
 * not authorization, and a test that implied otherwise would be worse than none.
 */

const routerState = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="route-outlet">route</div>,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: routerState.pathname } }),
  createRootRouteWithContext: () => () => ({}),
  createFileRoute: () => () => ({}),
  redirect: (options: unknown) => {
    throw Object.assign(new Error("redirect"), { isRedirect: true, options });
  },
}));

/**
 * The chrome is stubbed rather than rendered.
 *
 * Rendering the real ones would drag in the whole cart store, the chatbot's session
 * and the rail's portal container, and a failure in any of those would be reported as
 * a failure of the thing under test. A stub identifies itself by name, which is what
 * these assertions match on.
 *
 * Each `vi.mock` is written out rather than generated in a loop: the calls are
 * hoisted, and a hoisted call inside a loop is not a thing.
 */
vi.mock("@/components/layout/site-header", () => ({
  SiteHeader: () => <div data-testid="SiteHeader" />,
}));

vi.mock("@/components/layout/site-footer", () => ({
  SiteFooter: () => <div data-testid="SiteFooter" />,
}));

vi.mock("@/components/shared/GoToTop", () => ({
  GoToTop: () => <div data-testid="GoToTop" />,
}));

vi.mock("@/features/chatbot", () => ({
  Chatbot: () => <div data-testid="Chatbot" />,
}));

vi.mock("@/features/cart", () => ({
  CartDrawerHost: () => <div data-testid="CartDrawerHost" />,
  // Providers the real components rely on; passthrough so the tree still renders.
  CartDrawerProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/floating/rail", () => ({
  FloatingRail: () => <div data-testid="FloatingRail" />,
  FloatingRailProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/** Renders the root layout as if the browser were at `pathname`. */
function renderAt(pathname: string) {
  routerState.pathname = pathname;
  return render(<RootLayout />);
}

describe("the root layout's customer chrome", () => {
  it("renders the header, footer and floating controls on a customer page", () => {
    renderAt("/products");

    // The baseline. Without this, "no chrome anywhere" would satisfy every assertion
    // below — which is the failure mode a suppression test has to guard against.
    for (const name of [
      "SiteHeader",
      "SiteFooter",
      "FloatingRail",
      "GoToTop",
      "Chatbot",
      "CartDrawerHost",
    ]) {
      expect(screen.getByTestId(name), `${name} is missing from a customer page`).toBeInTheDocument();
    }
    expect(screen.getByTestId("route-outlet")).toBeInTheDocument();
  });

  it("suppresses every one of them under /admin", () => {
    renderAt("/admin");

    for (const name of [
      "SiteHeader",
      "SiteFooter",
      "FloatingRail",
      "GoToTop",
      "Chatbot",
      "CartDrawerHost",
    ]) {
      expect(screen.queryByTestId(name), `${name} leaked into /admin`).not.toBeInTheDocument();
    }
    // The route itself still renders — suppression is of the chrome, not the page.
    expect(screen.getByTestId("route-outlet")).toBeInTheDocument();
  });

  it("suppresses them on every nested admin route", () => {
    // Only checking `/admin` exactly would leave `/admin/products` — the page the
    // catalogue actually lives on — with the storefront wrapped around it.
    for (const path of ["/admin/products", "/admin/moderation", "/admin/orders"]) {
      const view = renderAt(path);
      expect(screen.queryByTestId("SiteHeader"), `${path} has a site header`).not.toBeInTheDocument();
      expect(screen.queryByTestId("CartDrawerHost"), `${path} has a cart`).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("leaves a customer page whose slug merely starts with 'admin' alone", () => {
    // The prefix-matching bug. `/admin-guide` is a storefront page; matching it would
    // leave it with no header, no footer and no way to navigate away.
    renderAt("/admin-guide");

    expect(screen.getByTestId("SiteHeader")).toBeInTheDocument();
    expect(screen.getByTestId("SiteFooter")).toBeInTheDocument();
  });

  it("does not suppress a path where 'admin' appears as a substring", () => {
    // `/superadmin-tools` and `/my-admin-dashboard` are not admin routes. `includes`
    // would catch all three of these; only a segment comparison does not.
    for (const path of ["/superadmin-tools", "/my-admin-dashboard", "/admin-tools"]) {
      const view = renderAt(path);
      expect(screen.getByTestId("SiteHeader"), `${path} lost its header`).toBeInTheDocument();
      view.unmount();
    }
  });

  it("treats the admin section as a path segment, not a prefix", () => {
    renderAt("/admin/products");
    expect(screen.queryByTestId("SiteHeader")).not.toBeInTheDocument();
    expect(screen.getByTestId("route-outlet")).toBeInTheDocument();
  });
});

describe("the admin route guard", () => {
  const admin = { role: "ADMIN", id: 1, name: "Ops" };

  it("lets an admin through", () => {
    // The happy path, so "it always redirects" is not mistaken for "it works".
    expect(() => requireAdmin({ context: { user: admin } })).not.toThrow();
  });

  it("sends a signed-out visitor to login, remembering where they were going", () => {
    expect(() =>
      requireAdmin({ context: { user: null }, location: { pathname: "/admin/products" } }),
    ).toThrow();

    try {
      requireAdmin({ context: { user: null }, location: { pathname: "/admin/products" } });
    } catch (thrown) {
      expect(thrown).toMatchObject({
        options: { to: "/login", search: { redirect: "/admin/products" } },
      });
    }
  });

  it("sends a signed-in non-admin to the storefront", () => {
    for (const role of ["USER", "SELLER", "ADMINISTRATOR"]) {
      expect(() => requireAdmin({ context: { user: { role } } }), `${role} was let in`).toThrow();
    }
  });

  it("does not mistake a seller for an administrator", () => {
    // `isSellerRole` covers several role spellings. An admin check that used it, or
    // that substring-matched the role name, would let a seller through — and
    // "ADMINISTRATOR" contains "ADMIN", so a `startsWith` check would too.
    expect(isSellerRole("SELLER")).toBe(true);
    expect(isSellerRole("ADMINISTRATOR")).toBe(false);
  });

  it("waits for the session rather than guessing", () => {
    // While `/auth/me` is in flight the user is `null` but not absent. Redirecting on
    // that would bounce a signed-in admin to the login page on every hard refresh.
    expect(() => requireAdmin({ context: { user: null, loading: true } })).toThrow(
      /redirect/,
    );
  });
});