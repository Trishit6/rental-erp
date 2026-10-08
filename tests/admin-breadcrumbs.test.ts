import { describe, expect, it } from "vitest";
import { adminBreadcrumbTrail } from "../src/features/admin/components/AdminBreadcrumbs";

/**
 * The admin breadcrumb trail.
 *
 * ## Why this is a plain unit test
 *
 * The trail is a pure function precisely so it can be pinned here rather than through
 * a rendered layout: the mapping from a pathname to "Admin / Reviews / Seller
 * engagement" is the sort of thing that drifts when it lives in JSX, and the sidebar
 * would keep one label while the breadcrumb kept another.
 */
describe("adminBreadcrumbTrail", () => {
  it("is just Admin on the workspace root", () => {
    expect(adminBreadcrumbTrail("/admin")).toEqual([{ label: "Admin" }]);
  });

  it("links the parent and leaves the current page unlinked", () => {
    expect(adminBreadcrumbTrail("/admin/products")).toEqual([
      { label: "Admin", to: "/admin" },
      { label: "Products" },
    ]);
  });

  it("labels the nested seller-engagement page", () => {
    expect(adminBreadcrumbTrail("/admin/reviews/sellers")).toEqual([
      { label: "Admin", to: "/admin" },
      { label: "Reviews", to: "/admin/reviews" },
      { label: "Seller engagement" },
    ]);
  });

  it("uses the plural audit-logs label", () => {
    expect(adminBreadcrumbTrail("/admin/audit-logs")).toEqual([
      { label: "Admin", to: "/admin" },
      { label: "Audit logs" },
    ]);
  });

  it("returns nothing outside the admin workspace", () => {
    // The component renders nothing rather than a stray "Admin" crumb if it is ever
    // mounted against a storefront path.
    expect(adminBreadcrumbTrail("/browse")).toEqual([]);
  });
});