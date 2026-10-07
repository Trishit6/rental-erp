import { api } from "@/lib/api/client";
import type { ProductCardData } from "@/lib/types";
import type { FavoriteListResponse, FavoriteProduct } from "@/features/favorites/types";
import type { AdminOverview } from "@/features/admin/types";
import type { OrderListResponse } from "@/features/orders/types";
import type { RentalListResponse } from "@/features/rentals/types";

/**
 * Every network call the dashboard makes.
 *
 * ## Why this file exists alongside the feature APIs
 *
 * The dashboard is a *composition* page: it shows a small slice of several
 * real surfaces (orders, rentals, favorites, the cart, the catalogue, platform
 * stats for an admin). Its requests hit the *same* endpoints the features use,
 * but with a smaller page size and a dedicated cache entry, so a user who
 * opens `/orders` afterwards still gets the full list without clashing with
 * the compact preview that just rendered. Cache coherence is kept for free:
 * the query keys hang off the same top-level prefixes (`orders`, `rentals`,
 * `favorites`, `products`, `admin-stats`), so the mutations that invalidate
 * those prefixes refresh the dashboard too.
 *
 * There is no `userId` anywhere: the server takes the owner from the session
 * cookie, so none of these calls can address another user's data.
 */

/** The five most recent orders. `pageSize` is not part of the orders contract. */
export async function getDashboardOrders(): Promise<OrderListResponse> {
  const { data, pagination } = await api.get<OrderListResponse["orders"]>("/orders?page=1");
  return {
    orders: data,
    total: pagination?.total ?? data.length,
    page: pagination?.page ?? 1,
    pageSize: pagination?.pageSize ?? data.length,
    totalPages: pagination?.totalPages ?? 1,
  };
}

/** The user's active rentals — the "currently in hand" ones. */
export async function getDashboardRentals(): Promise<RentalListResponse> {
  const { data, pagination } = await api.get<RentalListResponse["rentals"]>(
    "/rentals?bucket=active&page=1",
  );
  return {
    rentals: data,
    total: pagination?.total ?? data.length,
    page: pagination?.page ?? 1,
    pageSize: pagination?.pageSize ?? data.length,
    totalPages: pagination?.totalPages ?? 1,
  };
}

/** The four most recently saved favourites (`items` + real total in pagination). */
export async function getDashboardFavorites(): Promise<FavoriteListResponse> {
  const result = await api.get<FavoriteProduct[]>("/favorites?sort=recent&page=1&pageSize=4");
  const pagination = result.pagination ?? {
    page: 1,
    pageSize: 4,
    total: result.data.length,
    totalPages: 1,
  };
  return { items: result.data, pagination };
}

/** A small taste of the catalogue's "recommended" ordering, for the dashboard grid. */
export async function getRecommendedProducts(): Promise<ProductCardData[]> {
  return (await api.get<ProductCardData[]>("/products?sort=recommended&pageSize=4")).data;
}

/** Real platform figures for the admin's dashboard view. Admins only, enforced server-side. */
export async function getDashboardAdminStats(): Promise<AdminOverview> {
  return (await api.get<AdminOverview>("/admin/stats")).data;
}