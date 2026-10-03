import { useCallback, useEffect } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ordersListQueryOptions, syncOrderDetailToCollections, useOrder, useOrders } from "./query";
import {
  buildOrderTimeline,
  hasActiveFilters,
  parseOrderRouteParam,
  parseOrdersSearch,
  type OrdersSearch,
} from "./components/schema";
import { OrdersHeader } from "./components/OrdersHeader";
import { OrdersSearch as OrdersSearchField } from "./components/OrdersSearch";
import { OrdersFilter } from "./components/OrdersFilter";
import { OrdersSort } from "./components/OrdersSort";
import { OrderQuickFilters } from "./components/OrderQuickFilters";
import { OrderList } from "./components/OrderList";
import { OrdersEmptyState } from "./components/OrdersEmptyState";
import { OrdersSkeleton } from "./components/OrdersSkeleton";
import { OrdersErrorState } from "./components/OrdersErrorState";
import { OrderNotFound } from "./components/OrderNotFound";
import { OrderDetailsSkeleton } from "./components/OrderDetailsSkeleton";
import { OrderDetailsHeader } from "./components/OrderDetailsHeader";
import { OrderDetailsItems } from "./components/OrderDetailsItems";
import { OrderDetailsTimeline } from "./components/OrderDetailsTimeline";
import { OrderSummary } from "./components/OrderSummary";
import { OrderPaymentSummary } from "./components/OrderPaymentSummary";
import { OrderDeliverySummary } from "./components/OrderDeliverySummary";
import { OrderRentalSummary } from "./components/OrderRentalSummary";
import { OrderSellerInfo } from "./components/OrderSellerInfo";
import { OrderActionsPanel } from "./components/OrderActionsPanel";
import { ApiError } from "@/lib/api/client";

/**
 * `/orders` — the order history.
 *
 * All list state lives in the URL, not in component state. That makes a filtered
 * view shareable, makes the back button undo a filter the way a customer expects,
 * and means the route is the single source of truth for what is being shown.
 * TanStack Query then caches each distinct filter combination separately.
 */
export function OrdersPage() {
  const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const search = parseOrdersSearch(rawSearch);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();

  const { data, isPending, isError, error, refetch, isFetching } = useOrders(search);

  /** Merge a filter change into the URL, resetting to page 1 as filters change. */
  const patchSearch = useCallback(
    (patch: Partial<OrdersSearch>) => {
      const next: OrdersSearch = { ...search, ...patch };
      // A filter change invalidates the current page number: staying on page 7
      // of a narrower result set is how a customer sees an empty page.
      if (!("page" in patch)) delete next.page;
      void navigate({ to: "/orders", search: next, replace: true });
    },
    [navigate, search],
  );

  const clearFilters = useCallback(() => {
    // Keeps the sort — clearing filters is not the same as resetting the view.
    void navigate({
      to: "/orders",
      search: search.sort ? { sort: search.sort } : {},
      replace: true,
    });
  }, [navigate, search.sort]);

  const prefetchPage = useCallback(
    (page: number) => {
      void queryClient.prefetchQuery(ordersListQueryOptions({ ...search, page }));
    },
    [queryClient, search],
  );

  const orders = data?.orders ?? [];
  const filtersActive = hasActiveFilters(search);

  // The list is only "empty" once a request has actually answered. Treating a
  // pending request as empty is what produces the flash of "No orders yet" that
  // every customer sees on every navigation.
  const showEmpty = !isPending && !isError && orders.length === 0;

  return (
    <div className="page-wrap max-w-6xl space-y-6 pb-16 pt-8">
      <OrdersHeader resultCount={data?.total} />

      <div className="grid gap-5 lg:grid-cols-[280px_1fr] lg:items-start">
        {/* Filters. Sticky on desktop so they stay reachable while the list
            scrolls; stacked above the list on mobile. */}
        <div className="lg:sticky lg:top-24">
          <OrdersFilter search={search} onChange={patchSearch} onClear={clearFilters} />
        </div>

        <div className="space-y-4">
          {/* Quick pills: the one-tap path to the states customers look for.
              They write the same URL params as the sidebar, so the two views
              always agree. */}
          <OrderQuickFilters search={search} onChange={patchSearch} />

          <div className="flex flex-wrap items-center gap-3">
            <OrdersSearchField
              value={search.search ?? ""}
              onSearch={(value) => patchSearch({ search: value || undefined })}
            />
            <OrdersSort
              value={search.sort ?? "newest"}
              onChange={(sort) => patchSearch({ sort })}
            />
          </div>

          {isError ? (
            <OrdersErrorState error={error} onRetry={() => void refetch()} />
          ) : isPending ? (
            <OrdersSkeleton />
          ) : showEmpty ? (
            <OrdersEmptyState
              variant={filtersActive ? "filtered" : "none"}
              onClearFilters={clearFilters}
            />
          ) : (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              // Dim the previous page while the next one loads rather than
              // collapsing the layout, so paging does not jump.
              className={isFetching ? "opacity-70 transition-opacity" : undefined}
            >
              <OrderList
                orders={orders}
                page={data?.page ?? 1}
                totalPages={data?.totalPages ?? 1}
                onPageChange={(page) => patchSearch({ page })}
                onPrefetchPage={prefetchPage}
              />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * `/orders/$orderId` — one order in full.
 *
 * The param accepts the public `RV-2026-XXXXXX` number or a legacy numeric id.
 * An unparseable param is answered locally with "not found" instead of being
 * sent to the server, where it could only ever be a 404 anyway.
 */
export function OrderDetailsPage() {
  const params = useParams({ strict: false }) as { orderId?: string };
  const ref = parseOrderRouteParam(params.orderId);

  const { data, isPending, isError, error, refetch } = useOrder(ref);

  // Mirror the detail payload into the TanStack DB collections so reactive
  // readers see the order's lines and rentals without another request. Declared
  // before every early return below — a hook after one would run conditionally.
  useEffect(() => {
    if (data) syncOrderDetailToCollections(data);
  }, [data]);

  if (ref === null) {
    return <OrderNotFound reference={params.orderId} />;
  }

  if (isPending) {
    return <OrderDetailsSkeleton />;
  }

  // A 404 is "this order is not yours, or does not exist" — the server returns
  // the same answer for both on purpose, and the UI must not try to tell them
  // apart. Any other error is a genuine failure worth a retry.
  if (isError) {
    const status = error instanceof ApiError ? error.status : undefined;
    if (status === 404) {
      return <OrderNotFound reference={ref} />;
    }
    return <OrdersErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (!data) return <OrderNotFound reference={ref} />;

  const { order, items, rentals, payment, sellers } = data;

  // Derived from real fields only — see `buildOrderTimeline`.
  const timeline = buildOrderTimeline({
    order,
    payment,
    rentals,
  });

  // The rental portion of the order subtotal, so the totals block can name it
  // rather than folding it into "Items". Summed from the server's own line
  // amounts, never recomputed from a product price.
  const rentalAmount = items.reduce((sum, item) => sum + item.rentalCharge, 0);

  return (
    <div className="page-wrap max-w-5xl space-y-5 pb-16 pt-8">
      <OrderDetailsHeader order={order} />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="space-y-5">
          <OrderDetailsItems items={items} sellers={sellers} />
          <OrderDetailsTimeline events={timeline} />
        </div>

        <div className="space-y-5 lg:sticky lg:top-24">
          <section className="raised-surface p-5" aria-labelledby="order-total-heading">
            <h2 id="order-total-heading" className="mb-3 font-heading text-lg font-extrabold">
              Order total
            </h2>
            <OrderSummary amounts={order} rentalAmount={rentalAmount} />
          </section>

          <OrderPaymentSummary payment={payment} fallbackProvider={order.paymentProvider} />
          <OrderDeliverySummary
            method={order.deliveryMethod}
            address={order.deliveryAddressSnapshot}
            status={order.status}
            trackingNumber={order.trackingNumber}
          />
          <OrderRentalSummary rentals={rentals} />
          <OrderSellerInfo sellers={sellers} />
          <OrderActionsPanel order={order} items={items} rentals={rentals} />
        </div>
      </div>
    </div>
  );
}
