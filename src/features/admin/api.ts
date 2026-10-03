import { api } from "@/lib/api/client";
import { PAISE_PER_RUPEE } from "@/lib/pricing";
import type {
  AdminOverview,
  AdminProductFacets,
  AdminProductRow,
  AdminProductFilters,
} from "./types";

/**
 * Admin HTTP endpoints.
 *
 * ## Why filters are serialised here and not in the components
 *
 * The catalogue's query string is the contract with `adminProductsQuerySchema`, and
 * three different components read and write parts of it (the search box, the filter
 * bar, the sortable column headers). Building it in one place is what keeps them in
 * step — a component that sent `status=` for "no filter" would silently exclude
 * nothing *and* cache under a different key than the row above it.
 */

/**
 * Rupees as typed into the filter → paise as stored and compared.
 *
 * The API takes paise, matching every other price filter in the app. The field is
 * labelled in rupees because that is what a person types, so the conversion belongs
 * here: sending the raw number compared it against a paise column, making
 * "max ₹1,000" behave as "max ₹10".
 *
 * `0` is preserved rather than treated as absent — "free and up" is a real filter.
 */
function toPaise(rupees: number | null): number | null {
  return rupees === null ? null : Math.round(rupees * PAISE_PER_RUPEE);
}

/**
 * Serialises the catalogue's filters into a query string.
 *
 * Exported for the tests, because "no filter" is a behavioural contract rather than
 * a formatting detail: an empty-string `status=` would be rejected by the server's
 * `z.enum` as a 400, while an absent one means "no filter". Encoding that here means
 * the components cannot get it wrong individually.
 */
export function buildAdminProductQuery(filters: AdminProductFilters): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    params.set(key, String(value));
  };

  set("search", filters.search.trim());
  set("category", filters.category);
  set("seller", filters.seller);
  set("status", filters.status);
  set("condition", filters.condition);
  set("listingType", filters.listingType);
  set("minPrice", toPaise(filters.minPrice));
  set("maxPrice", toPaise(filters.maxPrice));
  set("sort", filters.sort);
  set("dir", filters.dir);
  set("page", filters.page);
  set("pageSize", filters.pageSize);

  return params.toString();
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return (await api.get<AdminOverview>("/admin/stats")).data;
}

export async function fetchAdminProducts(filters: AdminProductFilters): Promise<{
  rows: AdminProductRow[];
  total: number;
  totalPages: number;
}> {
  const result = await api.get<AdminProductRow[]>(
    `/admin/products?${buildAdminProductQuery(filters)}`,
  );
  return {
    rows: result.data,
    total: result.pagination?.total ?? result.data.length,
    totalPages: result.pagination?.totalPages ?? 1,
  };
}

export async function fetchAdminProductFacets(): Promise<AdminProductFacets> {
  return (await api.get<AdminProductFacets>("/admin/products/facets")).data;
}

export async function setAdminProductStatus(id: number, status: string): Promise<void> {
  await api.patch(`/admin/products/${id}/status`, { status });
}
