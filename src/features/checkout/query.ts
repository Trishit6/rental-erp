import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import { useCartQuery, type CartItem, type CartTotals } from "@/lib/query/cart";

export type Address = {
  id: number;
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

/**
 * Checkout reads the *same* cart entry the cart page and the drawer use, so the
 * items it prices and orders are the ones the user just looked at. It does not
 * fetch or cache the cart itself.
 */
export function useCartItems(): { data: CartItem[]; totals: CartTotals; isLoading: boolean } {
  const { items, cart, isPending } = useCartQuery();
  return { data: items, totals: cart.totals, isLoading: isPending };
}

export function useAddresses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.addresses,
    queryFn: async () => (await api.get<Address[]>("/addresses")).data,
    enabled: !!user,
  });
}

/**
 * Checkout no longer places the order.
 *
 * It used to POST `/orders` directly, which meant the order existed before any
 * payment was attempted and the server marked it `PAID` in the same breath — a
 * browser assertion standing in for a payment. Checkout now only collects the
 * *choices* (address, delivery method) and hands over to `/payment`, where the
 * amount is computed server-side and the order is created only after the payment
 * is verified. The cart is cleared by the server, in the same transaction that
 * creates the order, rather than by a second call from the browser that could
 * succeed while the order failed.
 */
