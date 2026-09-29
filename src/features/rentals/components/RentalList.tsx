import { Pagination } from "@/components/shared/pagination";
import type { Rental } from "../types";
import { RentalCard } from "./RentalCard";

/**
 * The rental list.
 *
 * A plain map: the page is paginated at ten to fifty rows, far below where
 * virtualization would repay its complexity. Owner names arrive with each row,
 * so fifty cards still cost one request.
 */
export function RentalList({
  rentals,
  page,
  totalPages,
  onPageChange,
  onPrefetchPage,
}: {
  rentals: Rental[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPrefetchPage?: (page: number) => void;
}) {
  return (
    <div className="space-y-4">
      <ul className="space-y-4" data-testid="rental-list">
        {rentals.map((rental) => (
          <li key={rental.id}>
            <RentalCard rental={rental} />
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
