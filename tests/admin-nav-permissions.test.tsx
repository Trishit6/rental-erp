import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { ADMIN_NAV, AdminSidebar } from "@/features/admin/components/AdminSidebar";
import type { AdminAccess } from "@/features/admin/access";
import { PERMISSION_KEYS, ROLE_PERMISSION_GRANTS } from "../server/lib/permission-catalogue";

/**
 * PROMPT 22 — the sidebar shows only the modules a staff member's permissions allow.
 *
 * ## Why this is asserted, when the server already refuses
 *
 * Server enforcement is the security boundary. This is the UX half the brief also
 * asks for: a support agent whose rail lists "Summary" will click it, wait, and get
 * a 403 — which reads as a broken workspace rather than a boundary. The filtering is
 * therefore a real requirement, and the risk is that a permission key in the nav
 * drifts from the seed's vocabulary and the row silently disappears for everyone.
 *
 * The two claims:
 *  1. every nav permission key exists in the catalogue the server grants from;
 *  2. a role's grant set decides which rows and headings render, with the
 *     permission-free rows (the admin's own feed) always present.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/admin" } }),
}));

function accessFor(role: keyof typeof ROLE_PERMISSION_GRANTS): AdminAccess {
  return {
    role: "ADMIN",
    roles: [role],
    permissions: [...ROLE_PERMISSION_GRANTS[role]],
    isSuperAdmin: role === "SUPER_ADMIN",
  };
}

function renderSidebar(access?: AdminAccess) {
  return render(<AdminSidebar access={access} />);
}

describe("the nav's permission vocabulary", () => {
  it("names only permissions the catalogue grants", () => {
    const keys = new Set(PERMISSION_KEYS);
    for (const section of ADMIN_NAV) {
      for (const item of section.items) {
        if (!item.permission) continue;
        expect(
          keys.has(item.permission),
          `"${item.label}" is gated on unknown permission "${item.permission}"`,
        ).toBe(true);
      }
    }
  });
});

describe("an unloaded access set", () => {
  it("shows every row, so the rail does not flash empty and refill", () => {
    renderSidebar(undefined);

    // The hook's contract: `undefined` is "not resolved yet", not "no access".
    for (const section of ADMIN_NAV) {
      expect(screen.getByRole("heading", { name: section.title })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /Summary/ })).toBeInTheDocument();
  });
});

describe("a SUPPORT account", () => {
  it("sees the queues it can work and not the money or the catalogue", () => {
    renderSidebar(accessFor("SUPPORT"));

    // Granted: orders, rentals, customers, reports, its own feed.
    expect(screen.getByRole("link", { name: /All orders/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Rentals/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Customers/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reports/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Notifications/ })).toBeInTheDocument();
    // Support's own queue (PROMPT 30).
    expect(screen.getByRole("link", { name: /Inbox/ })).toBeInTheDocument();

    // Refused: no product moderation, no money, no RBAC/admin settings.
    expect(screen.queryByRole("link", { name: /Products/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Categories/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Summary/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Payments/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Audit logs/ })).not.toBeInTheDocument();

    // The one Finance row it may use: seeing that a refund is pending is support's job,
    // returning the money is not (PROMPT 28).
    expect(screen.getByRole("link", { name: /Refunds/ })).toBeInTheDocument();
  });
});

describe("a section with nothing to show", () => {
  it("drops the heading rather than leaving a bare label", () => {
    renderSidebar(accessFor("FINANCE"));

    // FINANCE has no `users.view` and no `vendors.view`, so the whole Users section
    // goes; a heading with no rows under it reads as a broken workspace.
    expect(screen.queryByRole("heading", { name: "Users" })).not.toBeInTheDocument();
    // The Finance section survives because its money rows remain.
    expect(screen.getByRole("heading", { name: "Finance" })).toBeInTheDocument();
  });
});

describe("the endpoints of the permission range", () => {
  it("hides every gated row from a staff account holding no permission at all", () => {
    renderSidebar(accessFor("USER"));

    // Only the permission-free row survives.
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Notifications"]);
  });

  it("shows every row to a SUPER_ADMIN", () => {
    renderSidebar(accessFor("SUPER_ADMIN"));

    for (const section of ADMIN_NAV) {
      expect(screen.getByRole("heading", { name: section.title })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /Summary/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Audit logs/ })).toBeInTheDocument();
  });
});
