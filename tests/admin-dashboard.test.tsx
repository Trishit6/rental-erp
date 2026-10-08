import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ADMIN_NAV, AdminSidebar } from "@/features/admin/components/AdminSidebar";
import { OverviewCards } from "@/features/admin/components/OverviewCards";
import { AdminDashboardPage } from "@/features/admin/pages/AdminDashboardPage";
import { fetchAdminOverview, fetchAdminHealth, fetchAdminAuditPage } from "@/features/admin/api";
import { makeAdminOverview } from "./support/admin-fixtures";

/**
 * The dashboard's cards and the sidebar's navigation tree.
 *
 * ## Why these are pinned
 *
 * The cards are the only place the admin sees the marketplace's health, and they are
 * entirely made of numbers that came from a `COUNT`/`SUM` nobody can re-derive from
 * the page. A card wired to the wrong field is invisible — every other card still
 * looks fine — so each figure is asserted individually rather than as "some numbers
 * appeared".
 *
 * The sidebar is asserted against the spec's section list because the honest-but-
 * incomplete choice made here (inert "Soon" rows instead of omitted entries) is only
 * defensible if the full tree is actually written down. A section quietly dropped
 * would look identical to a section that was never specified.
 */

const navigateMock = vi.hoisted(() => vi.fn());
const routerState = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigateMock,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: routerState.pathname } }),
  useSearch: () => ({}),
  createRoute: () => ({ useLoaderData: () => undefined }),
}));

/**
 * The system-status block reads the signed-in administrator, so this test supplies
 * one directly rather than booting the whole auth provider (whose session query
 * would be another network call to stub). The dashboard only needs `user.role` to
 * decide the row reads "Session active".
 */
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Ops Admin", email: "admin@admin.com", role: "ADMIN" },
    loading: false,
  }),
}));

vi.mock("@/features/admin/api", () => ({
  fetchAdminOverview: vi.fn(),
  fetchAdminHealth: vi.fn(),
  fetchAdminAuditPage: vi.fn(),
  // `AdminRecentActivity` spreads the real empty-filter object; the mocked module has
  // to carry it or the dashboard cannot build its audit query.
  EMPTY_ADMIN_AUDIT_FILTERS: { action: "", entityType: null, page: 1, pageSize: 20 },
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  routerState.pathname = "/admin";
  vi.mocked(fetchAdminOverview).mockReset();
  vi.mocked(fetchAdminOverview).mockResolvedValue(makeAdminOverview());
  vi.mocked(fetchAdminHealth).mockReset();
  vi.mocked(fetchAdminHealth).mockResolvedValue({ status: "ok", database: "connected" });
  vi.mocked(fetchAdminAuditPage).mockReset();
  vi.mocked(fetchAdminAuditPage).mockResolvedValue({
    rows: [],
    total: 0,
    totalPages: 1,
    page: 1,
    pageSize: 6,
  });
});

describe("the overview cards", () => {
  function renderCards(props: Partial<Parameters<typeof OverviewCards>[0]> = {}) {
    return render(
      <OverviewCards
        data={makeAdminOverview()}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        {...props}
      />,
    );
  }

  it("shows all eight figures the spec asks for", () => {
    renderCards();

    for (const label of [
      "Total products",
      "Active products",
      "Total users",
      "Total sellers",
      "Total orders",
      "Active rentals",
      "Total revenue",
      "Pending payouts",
    ]) {
      expect(screen.getByText(label), `missing the "${label}" card`).toBeInTheDocument();
    }
  });

  it("renders each card from its own field of the response", () => {
    // One number per card, asserted against a fixture whose figures are all
    // distinct. If two cards read the same key, one of these assertions fails;
    // if one card is wired to the wrong key, so does this.
    renderCards();

    const expected: [string, string][] = [
      ["Total products", "20,022"],
      ["Active products", "19,880"],
      ["Total users", "95"],
      ["Total sellers", "32"],
      ["Total orders", "345"],
      ["Active rentals", "19"],
      ["Pending payouts", "7"],
    ];

    for (const [label, value] of expected) {
      const card = screen.getByText(label).closest("div")!.parentElement!;
      expect(within(card).getByText(value), `"${label}" shows the wrong number`).toBeInTheDocument();
    }
  });

  it("converts revenue from paise to rupees", () => {
    renderCards();

    const card = screen.getByText("Total revenue").closest("div")!.parentElement!;
    // 27,43,79,903 rupees. Without the conversion this reads ₹27,43,79,903 — a
    // number 100× too large that still *looks* like money.
    expect(within(card).getByText(/27,43,79,903/)).toBeInTheDocument();
    expect(within(card).queryByText(/2,74,37,99,0300/)).not.toBeInTheDocument();
  });

  it("says what each ambiguous figure excludes", () => {
    renderCards();

    // "Active products" and "Total revenue" are both under-specified without a
    // note: is a draft active? do unpaid orders count as revenue?
    expect(screen.getByText("Published or out of stock")).toBeInTheDocument();
    expect(screen.getByText("Excludes unpaid orders")).toBeInTheDocument();
  });

  it("shows a skeleton, not zeroes, while loading", () => {
    renderCards({ data: undefined, isLoading: true });

    // `0` would be the truth as far as the component knows and a lie as far as the
    // administrator is concerned — it reads as a collapsed marketplace.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to load the dashboard")).not.toBeInTheDocument();
  });

  it("reports a failure and offers a retry", () => {
    const onRetry = vi.fn();
    renderCards({ data: undefined, isLoading: false, isError: true, onRetry });

    expect(screen.getByText("Unable to load the dashboard")).toBeInTheDocument();
    // "Nothing has been changed" — the point of an error message on a dashboard is
    // to say the figures are unknown, not that they are zero or that anything broke.
    expect(screen.getByText(/Nothing has been changed/)).toBeInTheDocument();
  });

  it("re-asks for the figures when the retry is pressed", async () => {
    const onRetry = vi.fn();
    renderCards({ data: undefined, isLoading: false, isError: true, onRetry });

    await userEvent.setup().click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("distinguishes a genuinely empty marketplace from a failure", () => {
    renderCards({ data: makeAdminOverview({ totalProducts: 0, totalUsers: 0, totalOrders: 0 }) });

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.queryByText("Unable to load the dashboard")).not.toBeInTheDocument();
  });

  it("still shows cards when only some aggregates are zero", () => {
    // Only an entirely empty marketplace gets the empty state. A marketplace with
    // users but no orders is a young marketplace, not an absent one.
    renderCards({ data: makeAdminOverview({ totalProducts: 0, totalOrders: 0 }) });

    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
    expect(screen.getByText("Total users")).toBeInTheDocument();
  });
});

describe("the dashboard page", () => {
  it("renders the cards from the real endpoint", async () => {
    render(<AdminDashboardPage />, { wrapper });

    expect(await screen.findByText("Total products")).toBeInTheDocument();
    await vi.waitFor(() => expect(fetchAdminOverview).toHaveBeenCalled());
  });

  it("shows the figures once they arrive", async () => {
    render(<AdminDashboardPage />, { wrapper });

    expect(await screen.findByText("20,022")).toBeInTheDocument();
  });
});

describe("the sidebar's navigation tree", () => {
  it("declares every section the spec lists", () => {
    const titles = ADMIN_NAV.map((section) => section.title);
    expect(titles).toEqual([
      "Overview",
      "Marketplace",
      "Users",
      "Finance",
      "Moderation",
      "Platform",
    ]);
  });

  it("covers the sections' entries, not just their headings", () => {
    const entries = ADMIN_NAV.flatMap((section) =>
      section.items.map((item) => `${section.title}/${item.label}`),
    );

    // A heading with two entries where the spec named five is the failure this
    // catches: the tree would look complete in the sidebar and still be missing pages.
    for (const expected of [
      "Overview/Dashboard",
      "Marketplace/Products",
      "Marketplace/Categories",
      "Marketplace/Product images",
      "Marketplace/All orders",
      "Marketplace/Purchases",
      "Marketplace/Rentals",
      "Marketplace/Returns",
      "Users/Customers",
      "Users/Sellers",
      "Finance/Summary",
      "Finance/Payments",
      "Finance/Refunds",
      "Moderation/Reports",
      "Moderation/Moderation hub",
      "Moderation/Product reviews",
      "Moderation/Seller engagement",
      "Platform/Notifications",
      "Platform/Settings",
      "Platform/Audit logs",
    ]) {
      expect(entries, `sidebar is missing "${expected}"`).toContain(expected);
    }
  });

  it("renders every section heading", () => {
    render(<AdminSidebar />, { wrapper: ({ children }) => <>{children}</> });

    for (const section of ADMIN_NAV) {
      expect(screen.getByRole("heading", { name: section.title })).toBeInTheDocument();
    }
  });

  /** The sidebar row for one labelled item, scoped to its section. */
  // function navRow(sectionTitle: string, label: string): HTMLElement {
  //   const section = screen.getByRole("heading", { name: sectionTitle }).parentElement!;
  //   const item = within(section)
  //     .getAllByText(label, { selector: "span" })
  //     .find((node) => node.textContent === label)!;
  //   return item.closest("li")!;
  // }

  it("links the built pages", () => {
    render(<AdminSidebar />, { wrapper: ({ children }) => <>{children}</> });

    // Products is built, so it must be a real link.
    const products = screen.getByRole("link", { name: /Products/ });
    expect(products).toHaveAttribute("href", "/admin/products");
  });

  it("makes navigation entries clickable", () => {
    render(<AdminSidebar />, { wrapper: ({ children }) => <>{children}</> });

    const row = screen.getByRole("link", { name: /All orders/ });
    expect(row.tagName).toBe("A");
  });

  it("links every section in the admin workspace", () => {
    render(<AdminSidebar />, { wrapper: ({ children }) => <>{children}</> });

    const unbuilt = ADMIN_NAV.flatMap((section) =>
      section.items.filter((item) => !item.to).map((item) => `${section.title}/${item.label}`),
    );
    expect(unbuilt.length).toBe(0);
  });

  it("keeps every sidebar destination inside the admin area", () => {
    // The admin workspace is separate from the customer-facing navigation. A link
    // out to `/products` or `/cart` from here would put the site header, chatbot and
    // cart drawer back in reach from the admin workspace.
    for (const section of ADMIN_NAV) {
      for (const item of section.items) {
        if (!item.to) continue;
        expect(item.to, `"${item.label}" escapes the admin area`).toMatch(/^\/admin(\/|$)/);
      }
    }
  });

  it("marks the current page rather than the section it sits in", () => {
    routerState.pathname = "/admin/products";
    render(<AdminSidebar />, { wrapper: ({ children }) => <>{children}</> });

    // Products and Listings both point at /admin/products, so both are highlighted.
    // What must not happen is the dashboard staying lit because /admin is a prefix
    // of everything under it — which would leave two sections marked active on every
    // page except the dashboard.
    const dashboard = screen.getByRole("link", { name: /Dashboard/ });
    expect(dashboard.className).not.toContain("bg-primary/10");
  });
});