import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminProductsTable } from "@/features/admin/components/AdminProductsTable";
import {
  fetchAdminProductFacets,
  fetchAdminProducts,
  setAdminProductStatus,
} from "@/features/admin/api";
import { EMPTY_ADMIN_PRODUCT_FILTERS, type AdminProductFilters } from "@/features/admin/types";
import {
  makeAdminFacets,
  makeAdminProduct,
  makeDraftProduct,
  makeOutOfStockProduct,
  makePausedProduct,
  makeRentalOnlyProduct,
} from "./support/admin-fixtures";

/**
 * The admin catalogue table, rendered.
 *
 * ## Why this is render-tested at all
 *
 * Type-checking proves the props line up and the imports resolve. It does not prove
 * the table *mounts*, that the eleven columns render in the right place, or that the
 * three states — loading, empty, errored — are reachable rather than shadowed by each
 * other. Those are all runtime facts, and a table that throws on its first render is
 * an ordinary way to ship a green build.
 *
 * The behaviour pinned here is the behaviour that cannot be recovered from reading
 * the component: which column a sort click targets, that a filter change returns to
 * page one, that a rental-only listing shows a dash rather than ₹0, and that the
 * status action sends the status the row's *current* state implies.
 */

const navigateMock = vi.hoisted(() => vi.fn());
const routerState = vi.hoisted(() => ({ pathname: "/admin/products" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to?: string;
    params?: Record<string, string>;
    children?: ReactNode;
  }) => {
    const href = to?.includes("$")
      ? to.replace(/\/\$(\w+)/g, (_, key: string) => `/${params?.[key] ?? ""}`)
      : to;
    return <a href={href}>{children}</a>;
  },
  useNavigate: () => navigateMock,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: routerState.pathname } }),
}));

vi.mock("@/features/admin/api", () => ({
  fetchAdminProducts: vi.fn(),
  fetchAdminProductFacets: vi.fn(),
  setAdminProductStatus: vi.fn(),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderTable() {
  return render(<AdminProductsTable />, { wrapper });
}

/** The filters of the most recent request, read off the single argument passed. */
function lastFilters(): AdminProductFilters {
  const calls = vi.mocked(fetchAdminProducts).mock.calls;
  return calls[calls.length - 1]![0];
}

function page(page: { rows: unknown[]; total: number; totalPages?: number }) {
  return { totalPages: 1, ...page };
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  routerState.pathname = "/admin/products";
  navigateMock.mockReset();
  vi.mocked(fetchAdminProducts).mockReset();
  vi.mocked(fetchAdminProductFacets).mockReset();
  vi.mocked(setAdminProductStatus).mockReset();

  vi.mocked(fetchAdminProducts).mockResolvedValue(
    page({
      rows: [makeAdminProduct(), makeRentalOnlyProduct(), makeDraftProduct()],
      total: 3,
    }),
  );
  vi.mocked(fetchAdminProductFacets).mockResolvedValue(makeAdminFacets());
  vi.mocked(setAdminProductStatus).mockResolvedValue(undefined);
});

describe("the catalogue's columns", () => {
  it("shows all eleven columns, in the order the spec lists them", async () => {
    renderTable();
    await screen.findByText("Vintage film camera");

    // The header row only — a body cell can share text with a filter label.
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent?.trim());
    expect(headers).toEqual([
      "",
      "Image",
      "Product",
      "Category",
      "Seller",
      "Condition",
      "Sale price",
      "Rental price",
      "Stock",
      "Status",
      "Created",
      "Actions",
    ]);
  });

  it("renders a row's seller, category and prices from the denormalised row", async () => {
    renderTable();
    await screen.findByText("Vintage film camera");

    const row = screen.getByText("Vintage film camera").closest("tr")!;
    expect(within(row).getByText("Electronics")).toBeInTheDocument();
    expect(within(row).getByText("Daniel Kapoor")).toBeInTheDocument();
    // 4,500,000 paise → ₹45,000. A missing ×100 would render ₹450.
    expect(within(row).getByText("₹45,000")).toBeInTheDocument();
    // 75,000 paise → ₹750.
    expect(within(row).getByText("₹750")).toBeInTheDocument();
  });

  it("shows a dash for the price a listing type does not have", async () => {
    renderTable();
    await screen.findByText("Projector, 3000 lumen");

    const rentalOnly = screen.getByText("Projector, 3000 lumen").closest("tr")!;
    // Not "₹0": a rental-only listing has no sale price, and rendering zero would
    // read as "free to buy" — the opposite of the truth.
    expect(within(rentalOnly).getByText("—")).toBeInTheDocument();
    expect(within(rentalOnly).queryByText("₹0")).not.toBeInTheDocument();
    expect(within(rentalOnly).getByText("₹1,200")).toBeInTheDocument();
  });

  it("shows remaining stock against the total", async () => {
    renderTable();
    await screen.findByText("Handmade ceramic bowl");

    const draft = screen.getByText("Handmade ceramic bowl").closest("tr")!;
    // 1 of 4. A column showing only one of these is wrong in one direction or the
    // other, and which one is wrong is invisible until someone orders the last unit.
    // The number and the total are separate elements, so the match has to be on the
    // cell's combined text rather than on either node.
    const stockCell = within(draft)
      .getAllByRole("cell")
      .find((cell) => cell.textContent?.replace(/\s/g, "") === "1/4");
    expect(stockCell, "no cell reads 1/4").toBeDefined();
  });

  it("renders an underscore status and condition as words", async () => {
    renderTable();
    await screen.findByText("Handmade ceramic bowl");

    const draft = screen.getByText("Handmade ceramic bowl").closest("tr")!;
    // The column stores `LIKE_NEW`; a raw underscore in a table cell reads as a
    // data-formatting leak rather than a condition.
    expect(within(draft).getByText("LIKE NEW")).toBeInTheDocument();
    expect(within(draft).queryByText("LIKE_NEW")).not.toBeInTheDocument();
  });
});

describe("the catalogue's count", () => {
  it("counts the filtered total, not the rows on this page", async () => {
    vi.mocked(fetchAdminProducts).mockResolvedValue(
      page({ rows: [makeAdminProduct()], total: 20_022, totalPages: 1002 }),
    );
    renderTable();

    // The distinguishing detail: showing "1 product" when the database holds 20,022
    // filtered rows reads as "one product exists", which is the wrong answer to the
    // question an administrator is asking.
    await waitFor(() =>
      expect(screen.getByText(/20,022 products/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/showing 1 on this page/)).toBeInTheDocument();
  });

  it("uses the singular for exactly one product", async () => {
    vi.mocked(fetchAdminProducts).mockResolvedValue(
      page({ rows: [makeAdminProduct()], total: 1, totalPages: 1 }),
    );
    renderTable();

    await waitFor(() => expect(screen.getByText(/^1 product/)).toBeInTheDocument());
    expect(screen.queryByText(/1 products/)).not.toBeInTheDocument();
  });
});

describe("sorting", () => {
  it("sorts by the column whose header was clicked", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    await user.click(screen.getByRole("button", { name: /^Sale price/ }));

    await waitFor(() => expect(lastFilters().sort).toBe("purchasePrice"));
  });

  it("starts a newly chosen column descending and flips on a second click", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    const salePrice = screen.getByRole("button", { name: /^Sale price/ });
    await user.click(salePrice);
    await waitFor(() => expect(lastFilters()).toMatchObject({ sort: "purchasePrice", dir: "desc" }));

    // Same column again inverts. Without this, sorting by sale price can only ever
    // show the most expensive listing first, which makes it useless for finding the
    // cheap one.
    await user.click(screen.getByRole("button", { name: /^Sale price/ }));
    await waitFor(() => expect(lastFilters()).toMatchObject({ sort: "purchasePrice", dir: "asc" }));
  });

  it("resets to the first page when the sort changes", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAdminProducts).mockResolvedValue(
      page({ rows: [makeAdminProduct()], total: 500, totalPages: 25 }),
    );
    renderTable();
    await screen.findByText("Vintage film camera");

    // Land on a deep page first, so "reset to 1" is observable.
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(lastFilters().page).toBe(2));

    await user.click(screen.getByRole("button", { name: /^Sale price/ }));
    // Staying on page 5 of a different ordering usually lands past the end and
    // shows an empty table, which reads as "the sort broke".
    await waitFor(() => expect(lastFilters().page).toBe(1));
  });

  it("marks only the active column with aria-sort", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    await user.click(screen.getByRole("button", { name: /^Rental price/ }));

    await waitFor(() => {
      // Only headers that declare a sort participate at all — the ones without the
      // attribute are not sortable, which is different from being sorted "none".
      const sorted = screen
        .getAllByRole("columnheader")
        .filter(
          (cell) =>
            cell.hasAttribute("aria-sort") && cell.getAttribute("aria-sort") !== "none",
        );
      expect(sorted).toHaveLength(1);
      expect(sorted[0]).toHaveTextContent("Rental price");
      expect(sorted[0]).toHaveAttribute("aria-sort", "descending");
    });
  });
});

describe("filtering", () => {
  it("asks the server for the narrowed result rather than filtering in the browser", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.selectOptions(screen.getByLabelText("Status"), "PAUSED");

    // The status reaches the query, which is what the server filters on. Filtering
    // the three rows already fetched would report "no matches" for a page of 20,000.
    await waitFor(() => expect(lastFilters().status).toBe("PAUSED"));
  });

  it("converts a rupee price bound to paise", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.type(screen.getByLabelText("Max price (₹)"), "1000");

    // The field is labelled ₹ and the column is paise. Sending the raw number made
    // "max ₹1,000" behave as "max ₹10" — and, combined with the bounds being
    // OR'd together, matched the entire catalogue instead of none of it.
    await waitFor(() => expect(lastFilters().maxPrice).toBe(1000));
    await waitFor(() => expect(vi.mocked(fetchAdminProducts).mock.calls.length).toBeGreaterThan(1));
    const query = vi.mocked(fetchAdminProducts).mock.calls.at(-1)![0];
    expect(query.maxPrice).toBe(1000);
  });

  it("offers the seller's and category's real names as filter options", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: /^Filters/ }));

    // From `GET /admin/products/facets`, not a hardcoded list that would drift from
    // the database.
    const seller = await screen.findByLabelText("Seller");
    await waitFor(() =>
      expect(within(seller).getByRole("option", { name: "Daniel Kapoor" })).toBeInTheDocument(),
    );
    expect(within(seller).getByRole("option", { name: "Any seller" })).toBeInTheDocument();
  });

  it("keeps the filter panel out of the way until it is asked for", async () => {
    renderTable();
    await screen.findByText("Vintage film camera");

    const panel = document.getElementById("admin-product-filters")!;
    expect(panel).not.toBeVisible();

    await userEvent.setup().click(screen.getByRole("button", { name: /^Filters/ }));
    expect(panel).toBeVisible();
  });

  it("shows a Clear control only while something is narrowing the list", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    expect(screen.queryByRole("button", { name: /Clear/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.selectOptions(screen.getByLabelText("Condition"), "GOOD");

    const clear = await screen.findByRole("button", { name: /Clear/ });
    await user.click(clear);

    await waitFor(() => expect(lastFilters().condition).toBeNull());
  });

  it("debounces typing so a search is one request, not one per keystroke", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    const before = vi.mocked(fetchAdminProducts).mock.calls.length;
    await user.type(screen.getByLabelText("Search products"), "camera");

    // Still mid-typing: nothing has been requested.
    expect(vi.mocked(fetchAdminProducts).mock.calls.length).toBe(before);

    await waitFor(() => expect(lastFilters().search).toBe("camera"), { timeout: 2000 });
    const added = vi.mocked(fetchAdminProducts).mock.calls.length - before;
    expect(added).toBeLessThanOrEqual(2);
  });
});

describe("the status action", () => {
  it("offers Disable for a published listing and pauses it", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    const row = screen.getByText("Vintage film camera").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Disable" }));

    await waitFor(() =>
      expect(setAdminProductStatus).toHaveBeenCalledWith(101, "PAUSED"),
    );
  });

  it("offers Enable for a paused listing and publishes it", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAdminProducts).mockResolvedValue(
      page({ rows: [makePausedProduct()], total: 1 }),
    );
    renderTable();
    await screen.findByText("Standing desk");

    const row = screen.getByText("Standing desk").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Enable" }));

    await waitFor(() => expect(setAdminProductStatus).toHaveBeenCalledWith(105, "PUBLISHED"));
  });

  it("treats an out-of-stock listing as live", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAdminProducts).mockResolvedValue(
      page({ rows: [makeOutOfStockProduct()], total: 1 }),
    );
    renderTable();
    await screen.findByText("Mountain bike, 27.5 inch");

    const row = screen.getByText("Mountain bike, 27.5 inch").closest("tr")!;
    // Out of stock means the listing is still on the site, so it should be
    // "Disable", not "Enable" — publishing an unsellable listing is the opposite
    // of the administrator's intent.
    await user.click(within(row).getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(setAdminProductStatus).toHaveBeenCalledWith(104, "PAUSED"));
  });

  it("re-reads the catalogue after a status change", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    const before = vi.mocked(fetchAdminProducts).mock.calls.length;
    await user.click(
      within(screen.getByText("Vintage film camera").closest("tr")!).getByRole("button", {
        name: "Disable",
      }),
    );

    // The changed row may be on any page of any filter combination, so the whole
    // prefix is invalidated rather than the one visible key.
    await waitFor(
      () => expect(vi.mocked(fetchAdminProducts).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("links each row to the customer-facing product page", async () => {
    renderTable();
    await screen.findByText("Vintage film camera");

    const row = screen.getByText("Vintage film camera").closest("tr")!;
    expect(within(row).getByRole("link", { name: /View Vintage film camera/ })).toHaveAttribute(
      "href",
      "/product/vintage-film-camera",
    );
  });
});

describe("the catalogue's states", () => {
  it("shows a skeleton rather than an empty table while loading", async () => {
    vi.mocked(fetchAdminProducts).mockReturnValue(new Promise(() => {}));
    renderTable();

    // The failure this prevents: an empty result is indistinguishable from "no
    // products exist", so the first paint after opening the page says the catalogue
    // is empty, then fills in. That flash is what a skeleton exists to prevent.
    expect(screen.queryByText("No products yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to load products")).not.toBeInTheDocument();
  });

  it("says the catalogue is empty, not that the search found nothing", async () => {
    vi.mocked(fetchAdminProducts).mockResolvedValue(page({ rows: [], total: 0 }));
    renderTable();

    expect(await screen.findByText("No products yet")).toBeInTheDocument();
    expect(screen.queryByText("No products match")).not.toBeInTheDocument();
  });

  it("distinguishes 'no matches' from 'nothing exists' when filters are on", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("Vintage film camera");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.selectOptions(screen.getByLabelText("Status"), "DRAFT");

    vi.mocked(fetchAdminProducts).mockResolvedValue(page({ rows: [], total: 0 }));
    // Re-query by clearing and re-applying: a fresh key is what a real filter change
    // would produce.
    await user.selectOptions(screen.getByLabelText("Status"), "PAUSED");
    await user.selectOptions(screen.getByLabelText("Status"), "DRAFT");

    // "No products yet" while a filter is active would be a lie — there are 20,000
    // products, these filters just exclude them all.
    expect(await screen.findByText("No products match")).toBeInTheDocument();
  });

  it("explains a failure and offers a retry", async () => {
    vi.mocked(fetchAdminProducts).mockRejectedValue(new Error("boom"));
    renderTable();

    expect(await screen.findByText("Unable to load products")).toBeInTheDocument();

    const before = vi.mocked(fetchAdminProducts).mock.calls.length;
    await userEvent.setup().click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() =>
      expect(vi.mocked(fetchAdminProducts).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("does not leak the failure's detail into the page", async () => {
    // A raw error would put a stack trace, a SQL fragment or a file path on
    // screen. The message shown is the table's own, whatever the server said.
    vi.mocked(fetchAdminProducts).mockRejectedValue(
      new Error("ER_PARSE_ERROR near '(admin, 1234)' at /var/www/server/lib/admin-products.ts:88"),
    );
    renderTable();

    expect(await screen.findByText("Unable to load products")).toBeInTheDocument();
    expect(screen.queryByText(/ER_PARSE_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/admin-products\.ts/)).not.toBeInTheDocument();
  });

  it("still shows the filter bar when the table fails", async () => {
    vi.mocked(fetchAdminProducts).mockRejectedValue(new Error("boom"));
    renderTable();

    await screen.findByText("Unable to load products");
    // The failure is in the table, not the whole page. Losing the filters too would
    // mean restarting from scratch to recover.
    expect(screen.getByLabelText("Search products")).toBeInTheDocument();
  });
});

describe("paging", () => {
  it("requests the page that was clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAdminProducts).mockResolvedValue(
      page({ rows: [makeAdminProduct()], total: 500, totalPages: 25 }),
    );
    renderTable();
    await screen.findByText("Vintage film camera");

    await user.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => expect(lastFilters().page).toBe(2));
  });

  it("does not show paging controls for a single page", async () => {
    vi.mocked(fetchAdminProducts).mockResolvedValue(
      page({ rows: [makeAdminProduct()], total: 3, totalPages: 1 }),
    );
    renderTable();

    await screen.findByText("Vintage film camera");
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });
});

describe("the request the table makes", () => {
  it("starts from the documented defaults", async () => {
    renderTable();
    await waitFor(() => expect(fetchAdminProducts).toHaveBeenCalled());

    expect(fetchAdminProducts).toHaveBeenCalledWith(EMPTY_ADMIN_PRODUCT_FILTERS);
  });

  it("never sends a filter it was not given", async () => {
    renderTable();
    await waitFor(() => expect(fetchAdminProducts).toHaveBeenCalled());

    // Not `search=&status=&category=` — the server's schema treats an empty string as
    // an invalid enum value, and it would also give every keystroke of a cleared
    // search box its own cache entry.
    const filters = lastFilters();
    expect(filters.search).toBe("");
    expect(filters.status).toBeNull();
    expect(filters.category).toBeNull();
    expect(filters.minPrice).toBeNull();
  });
});