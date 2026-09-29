import { api } from "@/lib/api/client";
import type {
  RentalDetailsResponse,
  RentalExtensionQuote,
  RentalExtensionRequest,
  RentalListResponse,
  RentalReturnRequest,
  RentalReturnRequestResult,
} from "./types";
import type { RentalsSearch } from "./components/schema";

/**
 * Every network call the rentals feature makes.
 *
 * No React, no state, no UI — which is what lets the same functions back a query
 * hook, a prefetch, or a test without mounting anything.
 *
 * The user is never a parameter. The server derives the renter from the session
 * cookie, so there is no way to ask for someone else's rentals by editing a
 * request.
 */

function toQueryString(search: RentalsSearch, keys: (keyof RentalsSearch)[]): string {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = search[key];
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getRentals(search: RentalsSearch = {}): Promise<RentalListResponse> {
  const { data, pagination } = await api.get<RentalListResponse["rentals"]>(
    `/rentals${toQueryString(search, ["page", "search", "bucket", "status", "sort", "from", "to"])}`,
  );

  return {
    rentals: data,
    total: pagination?.total ?? data.length,
    page: pagination?.page ?? search.page ?? 1,
    pageSize: pagination?.pageSize ?? data.length,
    totalPages: pagination?.totalPages ?? 1,
  };
}

export async function getRentalById(rentalId: string | number): Promise<RentalDetailsResponse> {
  return (await api.get<RentalDetailsResponse>(`/rentals/${encodeURIComponent(String(rentalId))}`))
    .data;
}

/**
 * Ask for extra time.
 *
 * The request carries `additionalDays` and nothing else. The end date, the cost
 * and the availability verdict are all the server's — it is a *request*, so the
 * response is a quote, not an applied extension.
 */
export async function requestRentalExtension(
  rentalId: string | number,
  input: RentalExtensionRequest,
): Promise<RentalExtensionQuote> {
  return (
    await api.post<RentalExtensionQuote>(
      `/rentals/${encodeURIComponent(String(rentalId))}/extension-request`,
      input,
    )
  ).data;
}

/** Ask to hand the item back. Moves the rental to `RETURN_PENDING`. */
export async function requestRentalReturn(
  rentalId: string | number,
  input: RentalReturnRequest = { method: "DROP_OFF" },
): Promise<RentalReturnRequestResult> {
  return (
    await api.post<RentalReturnRequestResult>(
      `/rentals/${encodeURIComponent(String(rentalId))}/return-request`,
      input,
    )
  ).data;
}
