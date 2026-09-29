import { api, type Pagination } from "@/lib/api/client";
import type { ProductListResponse } from "@/lib/product-search/types";
import type { Category, CategoryDetail, ProductCardData } from "@/lib/types";
import type { CategoryFilters } from "./types";

/**
 * Map normalized category filters onto the products API. Prices are already paise
 * and `condition` is already in the database vocabulary, so no interpretation
 * happens here. The category itself is part of `filters.category`, which is what
 * keeps one product endpoint (and one query key) serving Browse and category pages.
 */
function toQueryString(filters: CategoryFilters): string {
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

/** All active categories with their real product and subcategory counts. */
export async function getCategories(): Promise<Category[]> {
  return (await api.get<Category[]>("/categories")).data;
}

/** The curated subset — the featured flag lives in the database, not here. */
export async function getFeaturedCategories(): Promise<Category[]> {
  return (await api.get<Category[]>("/categories?featured=true")).data;
}

/** One category plus its parent (for breadcrumbs). 404s for unknown/inactive. */
export async function getCategoryBySlug(idOrSlug: string): Promise<CategoryDetail> {
  return (await api.get<CategoryDetail>(`/categories/${encodeURIComponent(idOrSlug)}`)).data;
}

/** Active children of a category, each with its own product count. */
export async function getSubcategories(idOrSlug: string): Promise<Category[]> {
  return (await api.get<Category[]>(`/categories/${encodeURIComponent(idOrSlug)}/subcategories`))
    .data;
}

/** GET /api/products — filtering, sorting and pagination all happen server-side. */
export async function getCategoryProducts(filters: CategoryFilters): Promise<ProductListResponse> {
  const result = await api.get<ProductCardData[]>(`/products?${toQueryString(filters)}`);
  const pagination: Pagination = result.pagination ?? {
    page: filters.page,
    pageSize: filters.pageSize,
    total: result.data.length,
    totalPages: 1,
  };
  return { items: result.data, pagination };
}
