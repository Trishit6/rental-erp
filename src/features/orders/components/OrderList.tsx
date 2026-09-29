import { Pagination } from "@/components/shared/pagination";
import type { OrderSummary } from "../types";
import { OrderCard } from "./OrderCard";

/**
 * The order list.
 *
 * A plain map rather than a virtualised list: this page is paginated at ten to
 * fifty rows, which is far below the point where virtualization pays for its
 * complexity. Revisit only if the page size grows by an order of magnitude.
 */
export function OrderList({
  orders,
  page,
  totalPages,
  onPageChange,
  onPrefetchPage,
}: {
  orders: OrderSummary[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPrefetchPage?: (page: number) => void;
}) {
  return (
    <div className="space-y-4">
      <ul className="space-y-4" data-testid="order-list">
        {orders.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} />
          </li>
        ))}
      </ul>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        onPrefetch={onPrefetchPage}
      />
    </div>
  );
}
