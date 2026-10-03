import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { forgetSellerProduct, syncSellerProducts } from "@/lib/tanstack-db/sync";
import { fetchImageUploadConfig } from "@/lib/storage";
import {
  archiveSellerProduct,
  createSellerProduct,
  deleteSellerProduct,
  duplicateSellerProduct,
  fetchSellerProduct,
  fetchSellerProducts,
  setSellerProductInventory,
  setSellerProductStatus,
  updateSellerProduct,
} from "./api";
import type {
  ProductPayload,
  SellerProductFilters,
  SellerProductRow,
  SettableStatus,
} from "./types";

/**
 * Seller product queries and mutations.
 *
 * ## The list is paged in SQL, so the key carries the filters
 *
 * `queryKeys.sellerProductsList(filters)` includes the whole filter object. That
 * is what makes the cache correct: two pages of the same list at different
 * filters are different data, and a key that ignored the filters would show
 * `?status=PAUSED` with `?status=DRAFT` rows while typing in the search box. It
 * also means every *write* invalidates the whole `queryKeys.sellerProducts`
 * prefix, because a status change moves a row between filters — the row leaves
 * the `PAUSED` page and joins the `PUBLISHED` one, and neither page's key is the
 * one that changed.
 *
 * ## Never fetch just to fill the store
 *
 * `syncSellerProducts` is called from the list hook's data boundary and nowhere
 * else. The store mirrors the page the browser already asked for; it is never a
 * reason to make a request the screen does not need.
 */

/** The part of a row the private collection stores. */
function toCollectionRow(row: SellerProductRow) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    listingType: row.listingType,
    condition: row.condition,
    purchasePrice: row.purchasePrice,
    rentalPricePerDay: row.rentalPricePerDay,
    quantity: row.quantity,
    availableQuantity: row.availableQuantity,
    reservedQuantity: row.reservedQuantity,
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    soldUnits: row.soldUnits,
    rentalCount: row.rentalCount,
    earnedPaise: row.earnedPaise,
    primaryImage: row.primaryImage,
    createdAt: row.createdAt,
  };
}

export function useSellerProducts(filters: SellerProductFilters) {
  return useQuery({
    queryKey: queryKeys.sellerProductsList(filters),
    queryFn: async () => {
      const response = await fetchSellerProducts(filters);
      // Wrapped in try/catch: a store that stops reflecting the server is a bug,
      // not a reason for the list to fail rendering.
      try {
        syncSellerProducts(response.rows.map(toCollectionRow));
      } catch {
        /* the store is derived — never block the screen on it */
      }
      return response;
    },
    // Keeps the page on screen while the next one loads, so changing a filter
    // dims the rows rather than replacing them with a skeleton. The alternative
    // throws away the rows the seller was reading to find what they clicked.
    placeholderData: keepPreviousData,
  });
}

export function useSellerProduct(id: number) {
  return useQuery({
    queryKey: queryKeys.sellerProduct(id),
    queryFn: () => fetchSellerProduct(id),
  });
}

/**
 * How many rows elsewhere point at a listing — the answer to "can this be
 * deleted, or only archived?".
 *
 * Fetched when the remove dialog opens rather than joined into every row of the
 * list: `order_items`, `rentals` and `reviews` each `restrict` on
 * `products.id`, so the counts are three correlated aggregates, and paying for
 * them on twenty rows of every page to serve a dialog that is usually never
 * opened is the wrong trade. `staleTime` is generous because the answer only
 * changes when somebody buys the item.
 */
export function useProductReferences(id: number) {
  const { data } = useQuery({
    queryKey: queryKeys.sellerProduct(id),
    queryFn: () => fetchSellerProduct(id),
    staleTime: 60_000,
  });
  return data?.references ?? null;
}

/**
 * Upload limits for the image control.
 *
 * Read from the server rather than hardcoded in the form, because they are a
 * storage-provider fact (`MAX_IMAGE_BYTES`, `MAX_IMAGES_PER_LISTING`) — a client
 * that disagrees with the API produces a form that accepts a file the server then
 * refuses, which is the most annoying possible failure. The key is public
 * (no secrets in it, per `GET /api/storage/config`) and does not change per
 * deployment at runtime, so it is cached for the session.
 */
export function useStorageConfig() {
  const { data } = useQuery({
    queryKey: queryKeys.storageConfig,
    queryFn: fetchImageUploadConfig,
    staleTime: 30 * 60 * 1000,
  });
  return data ?? null;
}

/**
 * Everything a product write invalidates.
 *
 * Four prefixes, because one write moves data across four surfaces: the listings
 * table, the dashboard's cards, the analytics aggregates, and the public product
 * page (status, price and images all change what a customer sees). Missing the
 * public prefix is the one that actually shows a customer a stale price.
 */
async function invalidateProductWrites(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.sellerProducts }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sellerSummary }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sellerMe }),
    // Public catalogue: the customer's product page, the browse card badge, and
    // the category page all read `["product"]` entries.
    queryClient.invalidateQueries({ queryKey: queryKeys.productAll }),
    queryClient.invalidateQueries({ queryKey: queryKeys.products() }),
  ]);
}

export function useCreateSellerProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProductPayload) => createSellerProduct(payload),
    onSuccess: async (created) => {
      await invalidateProductWrites(queryClient);
      toast.success("Listing saved as a draft.");
      return created;
    },
  });
}

export function useUpdateSellerProduct(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<ProductPayload>) => updateSellerProduct(id, payload),
    onSuccess: async () => {
      await invalidateProductWrites(queryClient);
      toast.success("Listing updated.");
    },
  });
}

export function useProductStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: SettableStatus }) =>
      setSellerProductStatus(id, status),
    onSuccess: async (_result, { status }) => {
      await invalidateProductWrites(queryClient);
      toast.success(
        status === "PUBLISHED"
          ? "Listing is live."
          : status === "PAUSED"
            ? "Listing paused — customers can no longer find it."
            : status === "ARCHIVED"
              ? "Listing archived. Its orders and reviews are untouched."
              : "Listing moved back to draft.",
      );
    },
  });
}

export function useProductInventoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...edit }: { id: number; quantity?: number; availableQuantity?: number }) =>
      setSellerProductInventory(id, edit),
    onSuccess: async () => {
      await invalidateProductWrites(queryClient);
      toast.success("Stock updated.");
    },
  });
}

export function useDuplicateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => duplicateSellerProduct(id),
    onSuccess: async (created) => {
      await invalidateProductWrites(queryClient);
      toast.success("Copied to a new draft.");
      return created;
    },
  });
}

/**
 * Remove a listing that has never sold.
 *
 * The toast reports the archive case separately from the delete case on purpose.
 * A 409 means the listing still has order or review history, so nothing was
 * removed and the seller is told what to do instead — silently succeeding would
 * leave a live listing they believe is gone.
 */
export function useDeleteProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSellerProduct(id),
    onSuccess: async () => {
      await invalidateProductWrites(queryClient);
      toast.success("Listing removed.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "PRODUCT_HAS_HISTORY") {
        toast.error(error.message, {
          description: "Archive it instead — that keeps the history and hides the listing.",
        });
        return;
      }
      toast.error(error instanceof Error ? error.message : "Couldn't remove that listing.");
    },
  });
}

export function useArchiveProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => archiveSellerProduct(id),
    onSuccess: async () => {
      await invalidateProductWrites(queryClient);
      toast.success("Listing archived. Its history is kept.");
    },
  });
}

/** Remove a row from the reactive store once the server has confirmed the delete. */
export function forgetProductFromStore(id: number) {
  forgetSellerProduct(id);
}
