import { api, type Pagination } from "@/lib/api/client";
import type { ProductCardData } from "@/lib/types";
import type { BrowseFilters, ProductListResponse } from "./types";

/**
 * Map normalized browse filters onto the products API. Prices are already paise
 * and `condition` is already in the database vocabulary (or the `pre-loved`
 * alias the API expands), so no interpretation happens here.
 */
function toQueryString(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  };

  set("search", filters.search);
  set("category", filters.category);
  set("mode", filters.mode);
  set("condition", filters.condition);
  set("availability", filters.availability);
  set("sort", filters.sort);
  set("minPrice", filters.minPrice);
  set("maxPrice", filters.maxPrice);
  set("page", filters.page);
  set("pageSize", filters.pageSize);

  return params.toString();
}

/** GET /api/products — filtering, sorting and pagination all happen server-side. */
export async function getProducts(filters: BrowseFilters): Promise<ProductListResponse> {
  const result = await api.get<ProductCardData[]>(`/products?${toQueryString(filters)}`);
  const pagination: Pagination = result.pagination ?? {
    page: filters.page,
    pageSize: filters.pageSize,
    total: result.data.length,
    totalPages: 1,
  };
  return { items: result.data, pagination };
}

/** The category directory lives in `src/lib/categories.ts` — see the note there. */
