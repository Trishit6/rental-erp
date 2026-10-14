import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Route nesting — "nested routes that never render".
 *
 * A file-based child route renders inside its *parent's* `<Outlet />`. When the parent
 * is a page (a list screen with no Outlet), the child is unreachable: the URL matches,
 * the parent renders, and the detail component never mounts. The fix is the
 * trailing-underscore spelling (`orders_.$orderId.tsx`), which keeps the URL
 * (`/orders/$orderId`) but makes the route a *sibling* that renders in the layout's
 * Outlet instead — the same pattern `/support/$ticketId` already used.
 *
 * This reads the generated route table so a future rename that re-introduces the
 * nesting fails loudly, without needing a browser.
 */

const ROOT = join(__dirname, "..");
const TREE = readFileSync(join(ROOT, "src/routeTree.gen.ts"), "utf8");

/** [generated id, URL, the page type it must NOT be nested under, its route file]. */
const MOVED: [string, string, string, string][] = [
  [
    "/_authenticated/orders_/$orderId",
    "/orders/$orderId",
    "AuthenticatedOrdersRoute",
    "src/routes/_authenticated/orders_.$orderId.tsx",
  ],
  [
    "/_authenticated/rentals_/$rentalId",
    "/rentals/$rentalId",
    "AuthenticatedRentalsRoute",
    "src/routes/_authenticated/rentals_.$rentalId.tsx",
  ],
  [
    "/_authenticated/profile_/orders",
    "/profile/orders",
    "AuthenticatedProfileRoute",
    "src/routes/_authenticated/profile_.orders.tsx",
  ],
  [
    "/_authenticated/profile_/rentals",
    "/profile/rentals",
    "AuthenticatedProfileRoute",
    "src/routes/_authenticated/profile_.rentals.tsx",
  ],
  [
    "/_authenticated/profile_/wishlist",
    "/profile/wishlist",
    "AuthenticatedProfileRoute",
    "src/routes/_authenticated/profile_.wishlist.tsx",
  ],
  [
    "/_authenticated/profile_/activity",
    "/profile/activity",
    "AuthenticatedProfileRoute",
    "src/routes/_authenticated/profile_.activity.tsx",
  ],
  [
    "/admin/reviews_/sellers",
    "/admin/reviews/sellers",
    "AdminReviewsRoute",
    "src/routes/admin/reviews_.sellers.tsx",
  ],
  [
    "/seller/products_/new",
    "/seller/products/new",
    "SellerProductsRoute",
    "src/routes/seller/products_.new.tsx",
  ],
  [
    "/seller/products_/$productId/edit",
    "/seller/products/$productId/edit",
    "SellerProductsRoute",
    "src/routes/seller/products_.$productId.edit.tsx",
  ],
];

/** The layout routes that *do* render an `<Outlet />`, so nesting under them is safe. */
const LAYOUT_PARENTS = new Set(["AuthenticatedRoute", "AdminRoute", "rootRouteImport"]);

function entry(id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`'${escaped}': \\{([\\s\\S]*?)\\n    \\}`).exec(TREE);
  if (!match) throw new Error(`No route-table entry for ${id}`);
  return match[1]!;
}

describe("detail routes nested under a page are lifted to the layout", () => {
  it("reads the generated route table", () => {
    expect(TREE).toContain("routeTree");
    expect(TREE.length).toBeGreaterThan(1000);
  });

  for (const [id, url, forbiddenParent, file] of MOVED) {
    it(`${url} resolves to its own component (parent is a layout, not a page)`, () => {
      const block = entry(id);
      const parent = /parentRoute: typeof (\w+)/.exec(block)?.[1];

      expect(parent).toBeDefined();
      expect(parent).not.toBe(forbiddenParent);
      expect(LAYOUT_PARENTS.has(parent!)).toBe(true);
      // The URL is unchanged; only the nesting is.
      expect(block).toContain(`fullPath: '${url}'`);

      // The route file exists, is named as a non-nested sibling, and declares the id.
      const path = join(ROOT, file);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toContain(`createFileRoute("${id}")`);
    });
  }

  it("the parent pages really have no Outlet, so nesting could never have worked", () => {
    for (const file of [
      "src/features/orders/index.tsx",
      "src/features/rentals/index.tsx",
      "src/features/profile/index.tsx",
      "src/features/admin/pages/AdminReviewsPage.tsx",
      "src/features/seller-listings/index.tsx",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8")).not.toContain("<Outlet");
    }
  });

  it("the layouts that now host them do render an Outlet", () => {
    for (const file of [
      "src/components/layout/AuthenticatedLayout.tsx",
      "src/routes/admin.tsx",
      "src/routes/__root.tsx",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8")).toContain("<Outlet");
    }
  });
});
