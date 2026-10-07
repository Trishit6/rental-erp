import { Heart, Repeat2, ShoppingBag, ShoppingCart } from "lucide-react";
import { DashboardStatCard } from "./DashboardStatCard";
import { useDashboardFavorites, useDashboardOrders, useDashboardRentals } from "../query";
import { useCartQuery } from "@/lib/query/cart";

/**
 * The four customer statistics: Total Orders, Active Rentals, Favorites and
 * Cart Items. Each number is the *server's* real total for the authenticated
 * user — the orders/rentals/favourites figures come from the pagination
 * metadata of the actual list endpoints, and the cart figure is the shared
 * cart cache entry the drawer and the cart page already use. Nothing here is
 * fabricated, and there is no second counting endpoint that could drift from
 * the pages it claims to summarise. Sections that are still loading render a
 * skeleton, never a zero that reads like a finished fact.
 */
export function DashboardStats() {
  const orders = useDashboardOrders();
  const rentals = useDashboardRentals();
  const favorites = useDashboardFavorites();
  const cart = useCartQuery();

  return (
    <section
      aria-label="Your numbers at a glance"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <DashboardStatCard
        stat={{
          id: "orders",
          label: "Total Orders",
          value: String(orders.data?.total ?? 0),
          icon: ShoppingBag,
          to: "/orders",
        }}
        isLoading={orders.isPending}
      />
      <DashboardStatCard
        stat={{
          id: "active-rentals",
          label: "Active Rentals",
          value: String(rentals.data?.total ?? 0),
          icon: Repeat2,
          to: "/rentals",
        }}
        isLoading={rentals.isPending}
      />
      <DashboardStatCard
        stat={{
          id: "favorites",
          label: "Favorites",
          value: String(favorites.data?.pagination.total ?? 0),
          icon: Heart,
          to: "/favorites",
        }}
        isLoading={favorites.isPending}
      />
      <DashboardStatCard
        stat={{
          id: "cart",
          label: "Cart Items",
          value: String(cart.cart.totals.quantityCount),
          icon: ShoppingCart,
          to: "/cart",
        }}
        isLoading={cart.isPending}
      />
    </section>
  );
}