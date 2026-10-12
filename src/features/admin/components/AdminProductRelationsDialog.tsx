import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flag, MessageSquareQuote, RefreshCcw, ShoppingBag, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { useAdminProductRelations } from "../query";
import { formatAdminDateTime, humanizeEnum } from "./format";

/**
 * "What touches this listing" — the four relationships the catalogue detail needs.
 *
 * ## Why one dialog with four tabs rather than four screens
 *
 * The question an administrator actually has while looking at a listing is "is this
 * one a problem?" — and a listing becomes a problem through an order that went wrong,
 * a rental dispute, a bad review, or a report. Those are four different tables, and
 * splitting them across four navigations means the answer to "is this a problem" is
 * never on one screen. They are pulled together here, each capped and read-only; the
 * full moderation surfaces still own the actions.
 *
 * Empty is a real answer, so each tab says so explicitly rather than rendering a bare
 * table.
 */
export function AdminProductRelationsDialog({
  productId,
  productTitle,
  open,
  onOpenChange,
}: {
  productId: number | null;
  productTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const relations = useAdminProductRelations(open ? productId : null);
  const [tab, setTab] = useState<"orders" | "rentals" | "reviews" | "reports">("orders");

  const data = relations.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Related activity</DialogTitle>
          <DialogDescription>{productTitle}</DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="Related activity" className="flex flex-wrap gap-1 border-b border-[var(--divider)] pb-2">
          {(
            [
              ["orders", "Orders", ShoppingBag],
              ["rentals", "Rentals", RefreshCcw],
              ["reviews", "Reviews", Star],
              ["reports", "Reports", Flag],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                tab === value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {relations.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : relations.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Related activity could not be loaded.
          </p>
        ) : (
          <div className="min-h-[8rem]">
            {tab === "orders" ? (
              <RelationList
                empty="No orders have included this listing."
                items={data?.orders ?? []}
                render={(row) => (
                  <RelationRow
                    key={`${row.orderId}-${row.createdAt}`}
                    title={row.orderNumber ? `#${row.orderNumber}` : `Order ${row.orderId}`}
                    subtitle={`${row.buyerName ?? "Unknown buyer"} · ${row.quantity} × ${formatMoney(row.unitPrice)}`}
                    meta={formatAdminDateTime(row.createdAt)}
                    badge={humanizeEnum(row.status)}
                  />
                )}
              />
            ) : null}

            {tab === "rentals" ? (
              <RelationList
                empty="This listing has never been rented."
                items={data?.rentals ?? []}
                render={(row) => (
                  <RelationRow
                    key={row.id}
                    title={`Rental ${row.id}`}
                    subtitle={`${row.renterName ?? "Unknown renter"} · ${formatMoney(row.total)}`}
                    meta={`${new Date(row.startDate).toLocaleDateString("en-IN")} → ${new Date(
                      row.endDate,
                    ).toLocaleDateString("en-IN")}`}
                    badge={humanizeEnum(row.status)}
                  />
                )}
              />
            ) : null}

            {tab === "reviews" ? (
              <RelationList
                empty="No reviews yet."
                items={data?.reviews ?? []}
                render={(row) => (
                  <RelationRow
                    key={row.id}
                    title={`${row.rating}★ ${row.title ?? "Review"}`}
                    subtitle={`${row.authorName ?? "Unknown"} · ${row.comment}`}
                    meta={formatAdminDateTime(row.createdAt)}
                    badge={humanizeEnum(row.status)}
                  />
                )}
              />
            ) : null}

            {tab === "reports" ? (
              <RelationList
                empty="No reports against this listing."
                items={data?.reports ?? []}
                render={(row) => (
                  <RelationRow
                    key={row.id}
                    title={humanizeEnum(row.reason)}
                    subtitle={row.details ?? "No details given."}
                    meta={formatAdminDateTime(row.createdAt)}
                    badge={humanizeEnum(row.status)}
                  />
                )}
              />
            ) : null}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Each list is capped at the 20 most recent. Use{" "}
          <Link to="/admin/orders" className="underline">
            orders
          </Link>{" "}
          and{" "}
          <Link to="/admin/reviews" className="underline">
            reviews
          </Link>{" "}
          for the full history.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function RelationList<T>({
  items,
  empty,
  render,
}: {
  items: T[];
  empty: string;
  render: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) {
    return <EmptyState icon={MessageSquareQuote} title="Nothing to show" description={empty} />;
  }
  return <ul className="divide-y divide-[var(--divider)]">{items.map(render)}</ul>;
}

function RelationRow({
  title,
  subtitle,
  meta,
  badge,
}: {
  title: string;
  subtitle: string;
  meta: string;
  badge: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{subtitle}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{meta}</p>
      </div>
      <Badge className="shrink-0 bg-muted text-muted-foreground">{badge}</Badge>
    </li>
  );
}

function formatMoney(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
