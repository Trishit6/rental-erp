import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import {
  getRentalById,
  getRentals,
  requestRentalExtension,
  requestRentalReturn,
} from "@/features/rentals/api";
import {
  makeExtensionQuote,
  makeRental,
  makeRentalDetails,
  makeRentalListResponse,
} from "./support/rental-fixtures";

vi.mock("@/lib/api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

describe("reading the rental list", () => {
  it("asks for the renter's rentals by default", () => {
    vi.mocked(api.get).mockResolvedValue({ data: [], pagination: undefined } as never);

    void getRentals();

    // "My rentals" means the ones I booked, never the ones of my own listings.
    expect(api.get).toHaveBeenCalledWith("/rentals");
  });

  it("sends only the filters that are set", () => {
    vi.mocked(api.get).mockResolvedValue({ data: [], pagination: undefined } as never);

    void getRentals({ bucket: "active", sort: "ending_soon", page: 2 });

    const [path] = vi.mocked(api.get).mock.calls[0];
    expect(path).toContain("bucket=active");
    expect(path).toContain("sort=ending_soon");
    expect(path).toContain("page=2");
    expect(path).not.toContain("status=");
  });

  it("never sends a user id — the server derives the renter from the session", () => {
    vi.mocked(api.get).mockResolvedValue({ data: [], pagination: undefined } as never);

    void getRentals({ search: "x", bucket: "active", page: 1 });

    const [path] = vi.mocked(api.get).mock.calls[0];
    // The absence of this field is the authorisation. There is no way to ask for
    // someone else's rentals by editing the request.
    expect(path).not.toContain("userId");
    expect(path).not.toContain("renterId");
  });

  it("reads the server's pagination envelope", () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [makeRental()],
      pagination: { page: 2, pageSize: 10, total: 17, totalPages: 2 },
    } as never);

    return getRentals({ page: 2 }).then((result) => {
      expect(result.total).toBe(17);
      expect(result.totalPages).toBe(2);
      expect(result.rentals).toHaveLength(1);
    });
  });

  it("degrades safely when the server sends no pagination block", () => {
    vi.mocked(api.get).mockResolvedValue({ data: [makeRental()], pagination: undefined } as never);

    return getRentals().then((result) => {
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  it("carries the server-derived state the card renders", () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [makeRental()],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    } as never);

    return getRentals().then(({ rentals }) => {
      // The client never works these out from dates itself.
      expect(rentals[0].bucket).toBe("active");
      expect(rentals[0].isInHand).toBe(true);
      expect(rentals[0].depositStatus).toBe("HELD");
      expect(rentals[0].ownerName).toBe("Priya");
    });
  });
});

describe("reading one rental", () => {
  it("asks by id and escapes it", () => {
    vi.mocked(api.get).mockResolvedValue({ data: makeRentalDetails() } as never);

    void getRentalById(61);
    expect(api.get).toHaveBeenCalledWith("/rentals/61");

    vi.mocked(api.get).mockClear();
    void getRentalById("61/../orders");
    expect(api.get).toHaveBeenCalledWith("/rentals/61%2F..%2Forders");
  });

  it("returns the whole details payload the page needs", () => {
    vi.mocked(api.get).mockResolvedValue({ data: makeRentalDetails() } as never);

    return getRentalById(61).then((details) => {
      expect(details.rental.id).toBe(61);
      expect(details.seller?.name).toBe("Priya");
      expect(details.timeline.length).toBeGreaterThan(0);
      expect(details.eligibility.canExtend).toBe(true);
    });
  });

  it("passes an error through so the page can branch on the status", async () => {
    const notFound = Object.assign(new Error("Rental not found."), { status: 404 });
    vi.mocked(api.get).mockRejectedValue(notFound);

    await expect(getRentalById(61)).rejects.toBe(notFound);
  });
});

describe("requesting an extension", () => {
  it("sends a number of days and nothing else", () => {
    vi.mocked(api.post).mockResolvedValue({ data: makeExtensionQuote() } as never);

    void requestRentalExtension(61, { additionalDays: 3 });

    // The end date, the cost and the availability verdict are all the server's.
    expect(api.post).toHaveBeenCalledWith("/rentals/61/extension-request", { additionalDays: 3 });
  });

  it("returns the server's quote rather than computing one", () => {
    vi.mocked(api.post).mockResolvedValue({ data: makeExtensionQuote() } as never);

    return requestRentalExtension(61, { additionalDays: 3 }).then((quote) => {
      expect(quote.additionalCost).toBe(15_000);
      expect(quote.proposedEndDate).toBe("2026-10-09T00:00:00.000Z");
      expect(quote.requested).toBe(true);
    });
  });
});

describe("requesting a return", () => {
  it("posts to the return-request endpoint", () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { status: "RETURN_PENDING", requestedAt: null },
    } as never);

    void requestRentalReturn(61, { method: "DROP_OFF" });

    expect(api.post).toHaveBeenCalledWith("/rentals/61/return-request", { method: "DROP_OFF" });
  });

  it("defaults to drop-off when the caller says nothing", () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { status: "RETURN_PENDING", requestedAt: null },
    } as never);

    void requestRentalReturn(61);

    expect(api.post).toHaveBeenCalledWith("/rentals/61/return-request", {
      method: "DROP_OFF",
    });
  });
});

describe("no credential is ever sent or expected", () => {
  it("the list payload carries no payment or identity secrets", () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [makeRental()],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    } as never);

    return getRentals().then(({ rentals }) => {
      const keys = Object.keys(rentals[0]);
      for (const forbidden of ["cardNumber", "cvv", "upiPin", "password", "email"]) {
        expect(keys).not.toContain(forbidden);
      }
    });
  });
});

describe("the list response shape", () => {
  it("round-trips a single rental", () => {
    const list = makeRentalListResponse([makeRental()]);
    expect(list.rentals[0].status).toBe("ACTIVE");
  });
});
