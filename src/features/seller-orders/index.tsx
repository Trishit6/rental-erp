import { useRef, useState } from "react";
import { Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  useBulkFulfillment,
  useCancelSellerOrder,
  useSellerOrders,
  useSetFulfillment,
} from "./query";
import { BulkActionsBar } from "./components/BulkActionsBar";
import { SellerOrderCard } from "./components/SellerOrderCard";
import { useUndoWindow } from "./use-undo-window";
import {
  commonNextStates,
  DEFAULT_SELLER_ORDERS_FILTERS,
  SELLER_ORDER_SORT_LABELS,
  SELLER_ORDER_SORTS,
  SELLER_ORDER_STATUS_TABS,
  fulfillmentLabel,
  type BulkFulfillmentPayload,
  type SellerOrderStatusTab,
  type SellerOrdersFilters,
} from "./types";

/**
 * The seller order desk — `/seller/orders`.
 *
 * ## What this page is not
 *
 * It is not the customer's order history wearing a seller hat. Every row is an
 * order **containing this seller's lines**, scoped by the server to
 * `order_items.seller_id`, so a multi-seller order shows a seller only their own
 * items and their own subtotal. The previous page read `GET /orders` — the
 * customer's own purchases — which told a seller their revenue was a total they
 * had paid.
 *
 * ## Undo without a pending-state table
 *
 * A bulk fulfilment is held for a short window on the client (`useUndoWindow`)
 * and sent only when the window closes, so "undo" is not making the request.
 * Nothing incomplete is ever written, and there is no server state to expire.
 */

/** How long a bulk batch waits for an undo before it is sent. */
const UNDO_WINDOW_MS = 6000;

export function SellerOrdersPage() {
  const [filters, setFilters] = useState<SellerOrdersFilters>(DEFAULT_SELLER_ORDERS_FILTERS);
  const [searchDraft, setSearchDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const ordersQuery = useSellerOrders(filters);
  const setFulfillment = useSetFulfillment();
  const cancelOrder = useCancelSellerOrder();
  const bulk = useBulkFulfillment();

  // The selection to restore if a pending batch is undone. Held in a ref because
  // it is a value the commit path must not re-render on.
  const undoneSelection = useRef<Set<number>>(new Set());
  const undo = useUndoWindow<BulkFulfillmentPayload>(
    (payload) => bulk.mutate(payload),
    UNDO_WINDOW_MS,
  );

  const items = ordersQuery.data?.items ?? [];
  const pagination = ordersQuery.data?.pagination;

  const selectedOrders = items.filter((order) => selectedIds.has(order.id));
  const bulkNextStates = commonNextStates(selectedOrders.map((order) => order.fulfillmentStatus));
  const busy = setFulfillment.isPending || cancelOrder.isPending;

  function resetTo(patch: Partial<SellerOrdersFilters>) {
    setFilters((current) => ({ ...current, page: 1, ...patch }));
    setSelectedIds(new Set());
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulk(status: string) {
    const references = selectedOrders.map((order) => order.orderNumber ?? String(order.id));
    if (references.length === 0) return;
    undoneSelection.current = new Set(selectedIds);
    setSelectedIds(new Set());
    undo.schedule({ references, status });
  }

  function handleUndo() {
    undo.undo();
    setSelectedIds(undoneSelection.current);
  }

  return (
    <div className="page-wrap space-y-6 pb-24 pt-8">
      <header className="space-y-2">
        <p className="eyebrow">Your orders</p>
        <h1 className="section-title text-3xl">Orders to fulfil</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every order containing one of your listings. You only ever see your own items — another
          seller&rsquo;s lines in the same order are never shown or counted here.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {SELLER_ORDER_STATUS_TABS.map((tab) => (
          <Button
            key={tab}
            type="button"
            size="sm"
            variant={filters.status === tab ? "default" : "secondary"}
            aria-pressed={filters.status === tab}
            onClick={() => resetTo({ status: tab as SellerOrderStatusTab })}
          >
            {tab === "ALL" ? "All" : fulfillmentLabel(tab)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            resetTo({ search: searchDraft });
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Order number, customer or item"
              aria-label="Search your orders"
              className="h-11 w-full rounded-full border border-border bg-background pl-9 pr-4 text-sm"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          Sort
          <select
            value={filters.sort}
            onChange={(event) =>
              resetTo({ sort: event.target.value as SellerOrdersFilters["sort"] })
            }
            className="h-11 rounded-full border border-border bg-background px-4 text-sm text-foreground"
          >
            {SELLER_ORDER_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SELLER_ORDER_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ordersQuery.isLoading ? (
        <div className="space-y-3">
          <Card className="h-24 animate-pulse" />
          <Card className="h-24 animate-pulse" />
          <Card className="h-24 animate-pulse" />
        </div>
      ) : ordersQuery.isError ? (
        <Card className="p-6 text-sm text-destructive">
          {ordersQuery.error instanceof Error
            ? ordersQuery.error.message
            : "Could not load your orders."}
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={filters.status === "ALL" ? "No orders yet" : "Nothing in this tab"}
          description={
            filters.status === "ALL"
              ? "When a customer buys or rents one of your listings, the order appears here."
              : "Try another tab, or clear your search."
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((order) => (
            <SellerOrderCard
              key={order.id}
              order={order}
              selected={selectedIds.has(order.id)}
              expanded={expandedId === order.id}
              busy={busy}
              onToggleSelected={toggleSelected}
              onToggleExpanded={(id) => setExpandedId((current) => (current === id ? null : id))}
              onFulfill={(reference, status) => setFulfillment.mutate({ reference, status })}
              onCancel={(reference, reason) => cancelOrder.mutate({ reference, reason })}
            />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={filters.page <= 1}
            onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
          >
            Previous
          </Button>
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} orders
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={filters.page >= pagination.totalPages}
            onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
          >
            Next
          </Button>
        </div>
      )}

      <BulkActionsBar
        selectedCount={selectedOrders.length}
        nextStates={bulkNextStates}
        pending={undo.pending}
        busy={busy || bulk.isPending}
        onApply={applyBulk}
        onUndo={handleUndo}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
