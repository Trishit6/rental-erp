import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { useCartDrawer } from "@/lib/cart/drawer";
import { cartErrorMessage, useAddToCart } from "@/lib/query/cart";
import { queryKeys } from "@/lib/query/keys";
import { productDetailQueryOptions, shouldRetryRequest } from "@/lib/query/products";
import type { ProductCardData } from "@/lib/types";
import { checkProductAvailability, getRelatedProducts } from "./api";
import { buildCartPayload } from "./components/schema";
import type {
  ProductAction,
  ProductAvailability,
  ProductDetails,
  RelatedProduct,
  RentalOption,
} from "./types";

/* ---------------------------------- keys ----------------------------------- */

/**
 * Detail + related + availability all share the product-detail key prefix, so
 * `queryKeys.product(slug)` can be invalidated as one targeted group without
 * touching the rest of the cache.
 */
export const productDetailKeys = {
  detail: (productIdOrSlug: string) => queryKeys.product(productIdOrSlug),
  related: (productIdOrSlug: string) => queryKeys.productRelated(productIdOrSlug),
  availability: (productIdOrSlug: string, range: string) =>
    queryKeys.productAvailability(productIdOrSlug, range),
};

const RELATED_STALE_MS = 10 * 60_000;
const AVAILABILITY_STALE_MS = 30_000;

/* --------------------------------- queries --------------------------------- */

export function useProductDetail(productIdOrSlug: string, enabled = true) {
  return useQuery({
    ...productDetailQueryOptions(productIdOrSlug),
    enabled: enabled && productIdOrSlug.length > 0,
  });
}

export function useRelatedProducts(productIdOrSlug: string, enabled = true) {
  return useQuery({
    queryKey: productDetailKeys.related(productIdOrSlug),
    queryFn: () => getRelatedProducts(productIdOrSlug),
    enabled: enabled && productIdOrSlug.length > 0,
    staleTime: RELATED_STALE_MS,
    retry: shouldRetryRequest,
  });
}

/** Stable signature so identical windows reuse one cache entry. */
export function availabilityRangeKey(range?: { startDate: string; endDate: string }): string {
  return range ? `${range.startDate}__${range.endDate}` : "stock";
}

export function useProductAvailability(
  productIdOrSlug: string,
  range?: { startDate: string; endDate: string },
  enabled = true,
) {
  return useQuery({
    queryKey: productDetailKeys.availability(productIdOrSlug, availabilityRangeKey(range)),
    queryFn: () => checkProductAvailability(productIdOrSlug, range),
    enabled: enabled && productIdOrSlug.length > 0,
    staleTime: AVAILABILITY_STALE_MS,
    retry: shouldRetryRequest,
  });
}

/* -------------------------------- mutations -------------------------------- */

/**
 * The page's action bar: guest guard, cart mutation, checkout hand-off and the
 * pending button id all live here so the desktop buttons and the mobile bar run
 * one implementation (and can never double-submit). The cart mutation itself is
 * the shared one from `lib/query/cart`.
 */
export function useProductActions({
  product,
  quantity,
  rentalOption,
}: {
  product: ProductDetails | undefined;
  quantity: number;
  rentalOption: RentalOption | null;
}): { run: (action: ProductAction) => void; pendingActionId: string | null } {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mutation = useAddToCart();
  const { open: openCart } = useCartDrawer();
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const run = useCallback(
    (action: ProductAction) => {
      if (!product) return;

      // Never fail silently — send guests to sign in and come back here.
      if (!user) {
        toast("Sign in to continue", {
          description: "You need an account to rent or buy this item.",
          action: {
            label: "Sign in",
            onClick: () => {
              void navigate({ to: "/login", search: { redirect: location.href } });
            },
          },
        });
        return;
      }

      const payload = buildCartPayload({
        action,
        productId: product.id,
        quantity,
        rentalOption,
      });
      if (!payload) {
        toast("Choose a rental duration first.");
        return;
      }

      if (pendingActionId !== null) return;
      setPendingActionId(action.id);

      mutation.mutate(payload, {
        onSuccess: () => {
          if (action.intent === "checkout") {
            void navigate({ to: "/checkout" });
            return;
          }
          // Stay on the product. The drawer is the confirmation — it shows what
          // is in the cart now, rather than a toast that disappears before the
          // user can check the price.
          toast("Added to cart");
          openCart();
        },
        onError: (error) => {
          toast(cartErrorMessage(error));
        },
        onSettled: () => setPendingActionId(null),
      });
    },
    [
      location.href,
      mutation,
      navigate,
      openCart,
      pendingActionId,
      product,
      quantity,
      rentalOption,
      user,
    ],
  );

  return { run, pendingActionId };
}

/* --------------------------------- helpers --------------------------------- */

/**
 * The browse list already holds this product as a card. Reusing it lets the
 * loading skeleton show the real photo and title instead of grey blocks while
 * the full detail request is in flight.
 */
export function useCachedProductPreview(productIdOrSlug: string): ProductCardData | null {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const entries = queryClient.getQueriesData<{ items?: ProductCardData[] }>({
      queryKey: ["browse", "products"],
    });
    for (const [, value] of entries) {
      const match = value?.items?.find(
        (item) => item.slug === productIdOrSlug || String(item.id) === productIdOrSlug,
      );
      if (match) return match;
    }
    return null;
  }, [queryClient, productIdOrSlug]);
}

/** Warm a product page from a card hover/focus — one card, never the whole grid. */
export function prefetchProductDetail(queryClient: QueryClient, productIdOrSlug: string): void {
  void queryClient.prefetchQuery(productDetailQueryOptions(productIdOrSlug));
}

export type { ProductAvailability, RelatedProduct };
