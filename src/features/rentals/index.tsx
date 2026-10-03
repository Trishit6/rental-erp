import { useCallback, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ApiError } from "@/lib/api/client";
import { toast } from "sonner";
import {
  rentalsListQueryOptions,
  useRental,
  useRentals,
  useRequestRentalExtension,
  useRequestRentalReturn,
} from "./query";
import {
  hasActiveRentalFilters,
  parseRentalRouteParam,
  parseRentalsSearch,
  type RentalsSearch,
} from "./components/schema";
import { RentalsHeader } from "./components/RentalsHeader";
import { RentalsTabs } from "./components/RentalsTabs";
import { RentalsSearchField } from "./components/RentalsSearch";
import { RentalsFilter } from "./components/RentalsFilter";
import { RentalsSort } from "./components/RentalsSort";
import { RentalList } from "./components/RentalList";
import { RentalsEmptyState } from "./components/RentalsEmptyState";
import { RentalsErrorState } from "./components/RentalsErrorState";
import { RentalNotFound } from "./components/RentalNotFound";
import { RentalSkeleton } from "./components/RentalSkeleton";
import { RentalDetailsSkeleton } from "./components/RentalDetailsSkeleton";
import { RentalDetailsHeader } from "./components/RentalDetailsHeader";
import { RentalDetailsProduct } from "./components/RentalDetailsProduct";
import { RentalDetailsPricing } from "./components/RentalDetailsPricing";
import { RentalDetailsDelivery } from "./components/RentalDetailsDelivery";
import { RentalDetailsSeller } from "./components/RentalDetailsSeller";
import { RentalDetailsActions } from "./components/RentalDetailsActions";
import { RentalExtensionDialog } from "./components/RentalExtensionDialog";
import { RentalReturnDialog } from "./components/RentalReturnDialog";
import { RentalTimeline } from "./components/RentalTimeline";
import type { RentalExtensionQuote, RentalSort } from "./types";

/**
 * `/rentals` — the customer's rentals.
 *
 * All list state lives in the URL, so a filtered view is shareable and the back
 * button undoes a filter the way a customer expects. The server does the
 * filtering, sorting and paging; each combination is its own cache entry.
 */
export function RentalsPage() {
  const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const search = parseRentalsSearch(rawSearch);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();

  const { data, isPending, isError, error, refetch, isFetching } = useRentals({
    ...search,
    // Ask for a page explicitly: the server's pagination is opt-in so the
    // dashboard surfaces that predate this feature keep receiving the full list.
    page: search.page ?? 1,
  });

  const patchSearch = useCallback(
    (patch: Partial<RentalsSearch>) => {
      const next: RentalsSearch = { ...search, ...patch };
      // A filter change invalidates the current page number.
      if (!("page" in patch)) delete next.page;
      void navigate({ to: "/rentals", search: next, replace: true });
    },
    [navigate, search],
  );

  const clearFilters = useCallback(() => {
    void navigate({
      to: "/rentals",
      search: search.sort ? { sort: search.sort } : {},
      replace: true,
    });
  }, [navigate, search.sort]);

  const prefetchPage = useCallback(
    (page: number) => {
      void queryClient.prefetchQuery(rentalsListQueryOptions({ ...search, page }));
    },
    [queryClient, search],
  );

  const rentals = data?.rentals ?? [];
  // Only "you have no rentals at all" when nothing is narrowed. A filtered-empty
  // list is a different message entirely.
  const showEmpty = !isPending && !isError && rentals.length === 0;
  const variant = hasActiveRentalFilters(search) ? "filtered" : "none";

  return (
    <div className="page-wrap max-w-6xl space-y-6 pb-16 pt-8">
      <RentalsHeader resultCount={data?.total} />

      <div className="grid gap-5 lg:grid-cols-[280px_1fr] lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-24">
          <RentalsFilter search={search} onChange={patchSearch} onClear={clearFilters} />
        </div>

        <div className="space-y-4">
          <RentalsTabs value={search.bucket} onChange={(bucket) => patchSearch({ bucket })} />

          <div className="flex flex-wrap items-center gap-3">
            <RentalsSearchField
              value={search.search ?? ""}
              onSearch={(value) => patchSearch({ search: value || undefined })}
            />
            <RentalsSort
              value={(search.sort ?? "newest") as RentalSort}
              onChange={(sort) => patchSearch({ sort })}
            />
          </div>

          {isError ? (
            <RentalsErrorState error={error} onRetry={() => void refetch()} />
          ) : isPending ? (
            <RentalSkeleton />
          ) : showEmpty ? (
            <RentalsEmptyState
              variant={variant}
              bucket={search.bucket}
              onClearFilters={clearFilters}
            />
          ) : (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              className={isFetching ? "opacity-70 transition-opacity" : undefined}
            >
              <RentalList
                rentals={rentals}
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
 * `/rentals/$rentalId` — one rental in full.
 *
 * The param is a positive integer; anything else is answered locally with "not
 * found" rather than sent to the server, where it could only ever be a 404.
 *
 * Which actions exist is decided by the **server's** eligibility flags, not by
 * this component. The two dialogs are the only mutations, and both leave the
 * rental's end date and money untouched unless the server says otherwise.
 */
export function RentalDetailsPage() {
  const params = useParams({ strict: false }) as { rentalId?: string };
  const rentalId = parseRentalRouteParam(params.rentalId);

  const { data, isPending, isError, error, refetch } = useRental(rentalId);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [quote, setQuote] = useState<RentalExtensionQuote | null>(null);

  const extension = useRequestRentalExtension(rentalId ?? 0);
  const returnRequest = useRequestRentalReturn(rentalId ?? 0);

  if (rentalId === null) {
    return <RentalNotFound reference={params.rentalId} />;
  }

  if (isPending) return <RentalDetailsSkeleton />;

  // A 404 means "not yours, or does not exist" — the server returns the same
  // answer for both on purpose and this must not try to tell them apart.
  if (isError) {
    const status = error instanceof ApiError ? error.status : undefined;
    if (status === 404) return <RentalNotFound reference={rentalId} />;
    return <RentalsErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (!data) return <RentalNotFound reference={rentalId} />;

  const { rental, seller, delivery, timeline } = data;

  return (
    <div className="page-wrap max-w-5xl space-y-5 pb-16 pt-8">
      <RentalDetailsHeader rental={rental} />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="space-y-5">
          <RentalDetailsProduct rental={rental} seller={seller} />
          <section className="raised-surface p-5" aria-labelledby="rental-progress-heading">
            <h2 id="rental-progress-heading" className="mb-4 font-heading text-lg font-extrabold">
              Progress
            </h2>
            <RentalTimeline events={timeline} />
          </section>
          <RentalDetailsDelivery delivery={delivery} />
        </div>

        <div className="space-y-5 lg:sticky lg:top-24">
          <RentalDetailsPricing rental={rental} />
          <RentalDetailsSeller seller={seller} />
          <RentalDetailsActions
            rental={rental}
            details={data}
            onExtend={() => setExtensionOpen(true)}
            onReturn={() => setReturnOpen(true)}
          />
        </div>
      </div>

      <RentalExtensionDialog
        open={extensionOpen}
        onOpenChange={(open) => {
          setExtensionOpen(open);
          // A fresh dialog should not show a stale quote.
          if (!open) setQuote(null);
        }}
        rental={rental}
        isSubmitting={extension.isPending}
        quote={quote}
        onSubmit={async (additionalDays) => {
          try {
            setQuote(await extension.mutateAsync({ additionalDays }));
          } catch (err) {
            // The server's message is the reason — an unbookable window, a max
            // duration — so it is shown verbatim rather than paraphrased.
            toast.error(err instanceof Error ? err.message : "Could not request an extension.");
          }
        }}
      />

      <RentalReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        rental={rental}
        isSubmitting={returnRequest.isPending}
        onSubmit={async () => {
          try {
            await returnRequest.mutateAsync({ method: "DROP_OFF" });
            setReturnOpen(false);
            toast.success("Return requested. The seller will confirm once it's back.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not start the return.");
          }
        }}
      />
    </div>
  );
}
