import { describe, expect, it } from "vitest";
import {
  RENTAL_ROLES,
  RENTAL_SORTS,
  rentalsListQuerySchema,
  resolveRentalFilters,
} from "../server/lib/rental-queries";

/**
 * The rental list query contract.
 *
 * The two properties that matter most:
 *
 *  - nothing throws, because every value arrives from a URL a customer can edit;
 *  - **pagination is opt-in**, because the dashboard surfaces that predate this
 *    feature read the whole list and would silently lose rows if capped.
 */

describe("defaults", () => {
  it("defaults to the renter, newest, no filters and no paging", () => {
    const filters = resolveRentalFilters({});
    expect(filters).toMatchObject({
      page: null,
      pageSize: 20,
      search: "",
      status: null,
      bucket: null,
      sort: "newest",
      role: "renter",
      from: null,
      to: null,
    });
  });

  it("defaults to the renter, because 'my rentals' means the ones I booked", () => {
    // `owner` is the other side of the same table; `all` is the union the
    // dashboards ask for explicitly.
    expect(RENTAL_ROLES).toEqual(["renter", "owner", "all"]);
    expect(resolveRentalFilters({}).role).toBe("renter");
  });
});

describe("pagination is opt-in", () => {
  it("returns the full list when no paging is asked for", () => {
    // A pre-existing caller gets exactly what it always got.
    expect(resolveRentalFilters({}).page).toBeNull();
    expect(resolveRentalFilters({ search: "sofa" }).page).toBeNull();
  });

  it("switches to paging as soon as either param is present", () => {
    expect(resolveRentalFilters({ page: "3" }).page).toBe(3);
    expect(resolveRentalFilters({ pageSize: "25" }).page).toBe(1);
    expect(resolveRentalFilters({ pageSize: "25" }).pageSize).toBe(25);
  });

  it("caps an absurd page size", () => {
    expect(resolveRentalFilters({ pageSize: "99999" }).pageSize).toBe(20);
  });
});

describe("never throws on junk", () => {
  it("degrades every malformed value to a safe default", () => {
    for (const raw of [
      { page: "abc" },
      { page: -3 },
      { status: "NOT_A_STATUS" },
      { bucket: "sideways" },
      { sort: "by_vibes" },
      { role: "admin" },
      { from: "not-a-date" },
      { to: "2026-99-99" },
    ]) {
      const filters = resolveRentalFilters(raw);
      expect(filters.page === null || filters.page >= 1).toBe(true);
      expect(RENTAL_SORTS).toContain(filters.sort);
      expect(RENTAL_ROLES).toContain(filters.role);
    }
  });

  it("accepts a real status, bucket, sort and role", () => {
    const filters = resolveRentalFilters({
      status: "RETURN_PENDING",
      bucket: "active",
      sort: "ending_soon",
      role: "owner",
      search: "  camera  ",
    });
    expect(filters.status).toBe("RETURN_PENDING");
    expect(filters.bucket).toBe("active");
    expect(filters.sort).toBe("ending_soon");
    expect(filters.role).toBe("owner");
    expect(filters.search).toBe("camera");
  });

  it("expands a bare `to` date to the end of that day", () => {
    expect(resolveRentalFilters({ to: "2026-03-04" }).to?.toISOString()).toBe(
      "2026-03-04T23:59:59.999Z",
    );
  });

  it("bounds the search length", () => {
    expect(resolveRentalFilters({ search: "x".repeat(500) }).search.length).toBeLessThanOrEqual(120);
  });
});

describe("the zod mirror", () => {
  it("agrees with the resolver about what is valid", () => {
    expect(rentalsListQuerySchema.safeParse({ page: "2", sort: "ending_soon" }).success).toBe(true);
    expect(rentalsListQuerySchema.parse({ page: "nope" }).page).toBe(1);
  });
});

describe("sort vocabulary", () => {
  it("offers exactly the orderings the server implements", () => {
    expect(RENTAL_SORTS).toEqual(["newest", "oldest", "ending_soon", "starting_soon"]);
  });
});
