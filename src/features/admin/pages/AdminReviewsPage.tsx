import { EyeOff, MessageSquareQuote, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { AdminPageHeader } from "../components/AdminLayout";
import {
  AdminTable,
  AdminTableHead,
  AdminTableScaffold,
  TableBody,
  TableCell,
  TableRow,
} from "../components/AdminTableScaffold";
import { AdminConfirmDialog, useConfirmTarget } from "../components/AdminConfirmDialog";
import { formatAdminDate, humanizeEnum } from "../components/format";
import { MODERATION_STATUS_BADGE, NEUTRAL_BADGE } from "../components/status-badge";
import { useAdminReviewStatusMutation, useAdminReviewsList, useAdminSearchFilters } from "../query";
import { EMPTY_ADMIN_REVIEW_FILTERS, type AdminReviewRow } from "../api";

/**
 * `/admin/reviews` (product reviews) and `/admin/reviews/sellers` (seller reviews).
 *
 * ## What "seller reviews" honestly means here
 *
 * The schema has one review entity, written about a product line by a customer. There
 * is no review-of-a-seller record, and inventing one would create a table nothing
 * writes. The server's `scope=seller` therefore filters to *reviews that carry a seller
 * reply* — the ones where a seller actively engaged — and `lib/admin-queries.ts`
 * documents that reasoning where the query lives. This page mirrors the scope honestly:
 * the seller tab is labelled "Seller engagement" in the header, so nobody reads it as
 * a rating of a seller that does not exist.
 *
 * ## Hide, never delete
 *
 * The only moderation control here is hide/restore. A review is evidence of a real
 * transaction (`isVerifiedPurchase` comes from the order), so deleting one destroys a
 * record of something that happened. Hiding takes it out of every public average while
 * keeping it auditable, and the status change is reversible from the same row.
 */

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "PUBLISHED", label: "Published" },
  { value: "PENDING", label: "Pending" },
  { value: "HIDDEN", label: "Hidden" },
];

const SCOPE_OPTIONS = [
  { value: "product", label: "Product reviews" },
  { value: "seller", label: "Seller engagement" },
];

export function AdminReviewsPage({
  mode = "product",
}: {
  mode?: "product" | "seller";
}) {
  const [filters, setFilters] = useAdminSearchFilters({ ...EMPTY_ADMIN_REVIEW_FILTERS, scope: mode });
  const reviews = useAdminReviewsList(filters);
  const status = useAdminReviewStatusMutation();
  const confirm = useConfirmTarget<AdminReviewRow>();

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = reviews.data?.rows ?? [];
  const hasFilters = filters.search !== "" || filters.status !== null;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Reviews"
        title={mode === "seller" ? "Seller engagement" : "Product reviews"}
        description={
          mode === "seller"
            ? "Reviews a seller has replied to. Revaro has one review entity, written about a product — this is the closest honest view of seller response."
            : "Every review, with its rating and purchase type. Hiding a review removes it from public averages without destroying it."
        }
      />

      <AdminTableScaffold
        icon={MessageSquareQuote}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={reviews.isFetching && !reviews.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() =>
          setFilters({ ...EMPTY_ADMIN_REVIEW_FILTERS, scope: filters.scope })
        }
        filters={[
          {
            key: "scope",
            label: "Scope",
            value: filters.scope,
            onChange: (value) => update({ scope: value as "product" | "seller" }),
            options: SCOPE_OPTIONS,
          },
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: STATUS_OPTIONS,
          },
        ]}
        count={reviews.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={reviews.isLoading && !reviews.data}
        isError={reviews.isError}
        onRetry={() => void reviews.refetch()}
        emptyTitle={hasFilters ? "No reviews match" : "No reviews yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try a different status or clear the search."
            : "Reviews appear here once customers rate something they bought."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={reviews.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={["Rating", "Review", "Subject", "Reviewer", "Purchase", "Status", "Date", "Actions"]}
          />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  <RatingCell rating={row.rating} />
                </TableCell>
                <TableCell className="max-w-80">
                  {row.title ? (
                    <p className="truncate font-semibold">{row.title}</p>
                  ) : null}
                  <p className="line-clamp-2 text-xs text-muted-foreground">{row.comment}</p>
                </TableCell>
                <TableCell className="max-w-56">
                  {row.productTitle ? (
                    <>
                      <p className="truncate">{row.productTitle}</p>
                      {row.sellerName ? (
                        <p className="truncate text-xs text-muted-foreground">
                          by {row.sellerName}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {row.sellerName ?? "Seller review"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.reviewerName}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {row.isVerifiedPurchase ? (
                    <Badge className="whitespace-nowrap bg-success/15 text-success">Verified</Badge>
                  ) : (
                    <span className="text-muted-foreground">
                      {humanizeEnum(row.purchaseType)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    className={`whitespace-nowrap ${MODERATION_STATUS_BADGE[row.status] ?? NEUTRAL_BADGE}`}
                  >
                    {humanizeEnum(row.status)}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatAdminDate(row.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      disabled={status.isPending}
                      onClick={() => confirm.request(row)}
                    >
                      {row.status === "HIDDEN" ? (
                        "Restore"
                      ) : (
                        <>
                          <EyeOff size={14} aria-hidden />
                          Hide
                        </>
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>

      <ReviewVisibilityDialog
        row={confirm.target}
        isSubmitting={status.isPending}
        onCancel={confirm.close}
        onConfirm={(next) => {
          if (!confirm.target) return;
          const id = confirm.target.id;
          status.mutate({ id, status: next }, { onSettled: confirm.close });
        }}
      />
    </div>
  );
}

/**
 * Stars, spelled with a Lucide icon rather than the `★`/`☆` characters.
 *
 * `★` renders at whatever size the font decides and inherits its weight from the
 * type scale, which is how a rating column ends up with mismatched glyph sizes across
 * platforms. `Star` takes an explicit `size` and a fill, so five of them are always
 * five of the same icon.
 *
 * The number is always shown beside them: icons alone would leave the value unreadable
 * to a screen reader and imprecise (3.5 vs 4 is a real difference in a rating column).
 */
function RatingCell({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex" aria-hidden>
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            size={13}
            className={index < rounded ? "fill-primary text-primary" : "text-muted-foreground/40"}
          />
        ))}
      </span>
      <span className="text-xs font-semibold tabular-nums">{rating.toFixed(1)}</span>
    </span>
  );
}

/** Hide or restore, stated in terms of what a customer stops seeing. */
function ReviewVisibilityDialog({
  row,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  row: AdminReviewRow | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (status: "PUBLISHED" | "HIDDEN") => void;
}) {
  if (!row) return null;
  const hiding = row.status !== "HIDDEN";

  return (
    <AdminConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      subject={`${row.rating.toFixed(1)}★ by ${row.reviewerName}${row.productTitle ? ` on ${row.productTitle}` : ""}`}
      title={hiding ? "Hide this review?" : "Restore this review?"}
      body={
        hiding ? (
          <p>
            It disappears from the product's public rating and from{" "}
            {row.sellerName ? `${row.sellerName}'s` : "the seller's"} profile. The review itself is
            kept, so this is reversible and the record of what the customer said survives.
          </p>
        ) : (
          <p>
            It is counted again in the product's public rating
            {row.sellerName ? ` and on ${row.sellerName}'s profile` : ""}. It becomes visible to
            everyone immediately.
          </p>
        )
      }
      confirmLabel={hiding ? "Hide review" : "Restore review"}
      isSubmitting={isSubmitting}
      onConfirm={() => onConfirm(hiding ? "HIDDEN" : "PUBLISHED")}
    />
  );
}
