import { useState } from "react";
import { BadgeCheck, BadgeX, Store } from "lucide-react";
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
import { formatAdminCount, formatAdminDate, formatAdminMoney } from "../components/format";
import { MODERATION_STATUS_BADGE } from "../components/status-badge";
import { useAdminSellerVerification, useAdminSellersList } from "../query";
import { EMPTY_ADMIN_SELLER_FILTERS, type AdminSellerRow } from "../api";

/**
 * `/admin/sellers` — every seller account, with what they have sold.
 *
 * ## Verification is the only control here
 *
 * `verified` is the field the rest of the app reads: it gates a seller's badge on their
 * listings and whether a customer sees them as trusted. Approving is the one decision on
 * this screen, so it is the one control. Everything else — revenue, listings, orders —
 * is displayed read-only because financial and catalogue history is not edited from a
 * user table; `order_items` and `wallet_transactions` are append-only by design.
 *
 * Revenue here is the wallet's own `SALE`/`RENTAL` credits with reversals excluded,
 * which is why it can legitimately differ from the order table's totals: a refunded or
 * reversed sale stops counting as revenue the moment it is reversed.
 */

const STATUS_OPTIONS = [
  { value: "", label: "Every seller" },
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Awaiting approval" },
  { value: "suspended", label: "Suspended" },
];

export function AdminSellersPage() {
  const [filters, setFilters] = useState(EMPTY_ADMIN_SELLER_FILTERS);
  const sellers = useAdminSellersList(filters);
  const verification = useAdminSellerVerification();
  const confirm = useConfirmTarget<AdminSellerRow>();

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = sellers.data?.rows ?? [];
  const hasFilters = filters.search !== "" || filters.status !== null;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Users"
        title="Sellers"
        description="Every seller account with their listings, sales and lifetime revenue. Approval is the only change made here."
      />

      <AdminTableScaffold
        icon={Store}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={sellers.isFetching && !sellers.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_SELLER_FILTERS })}
        filters={[
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: STATUS_OPTIONS,
          },
        ]}
        count={sellers.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={sellers.isLoading && !sellers.data}
        isError={sellers.isError}
        onRetry={() => void sellers.refetch()}
        emptyTitle={hasFilters ? "No sellers match" : "No sellers yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try clearing one."
            : "Seller accounts appear here once someone completes onboarding."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={sellers.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={[
              "Seller",
              "Location",
              "Listings",
              "Orders",
              "Rentals",
              "Revenue",
              "Status",
              "Joined",
              "Actions",
            ]}
          />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-64">
                  <p className="truncate font-semibold">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.location ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums">{formatAdminCount(row.products)}</TableCell>
                <TableCell className="tabular-nums">{formatAdminCount(row.orders)}</TableCell>
                <TableCell className="tabular-nums">{formatAdminCount(row.rentals)}</TableCell>
                <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                  {formatAdminMoney(row.revenue)}
                </TableCell>
                <TableCell>
                  <SellerStatusCell row={row} />
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
                      disabled={verification.isPending}
                      onClick={() => confirm.request(row)}
                    >
                      {row.verified ? (
                        <>
                          <BadgeX size={14} aria-hidden />
                          Revoke
                        </>
                      ) : (
                        <>
                          <BadgeCheck size={14} aria-hidden />
                          Approve
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

      <SellerVerificationDialog
        row={confirm.target}
        isSubmitting={verification.isPending}
        onCancel={confirm.close}
        onConfirm={(verified) => {
          if (!confirm.target) return;
          const id = confirm.target.id;
          verification.mutate({ id, verified }, { onSettled: confirm.close });
        }}
      />
    </div>
  );
}

/**
 * Suspended outranks verified.
 *
 * The row carries both a `verified` flag and a `suspended` flag, and an account can be
 * both — approving a suspended seller is possible and would otherwise show two badges
 * saying opposite things. Suspension is what removes their access, so it is the one
 * that wins the cell.
 */
function SellerStatusCell({ row }: { row: AdminSellerRow }) {
  if (row.suspended) {
    return (
      <Badge className={`whitespace-nowrap ${MODERATION_STATUS_BADGE.SUSPENDED}`}>
        Suspended
      </Badge>
    );
  }
  return (
    <Badge
      className={`whitespace-nowrap ${row.verified ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
    >
      {row.verified ? "Verified" : "Unverified"}
    </Badge>
  );
}

/**
 * Approving or revoking, stated in terms of what the customer will see.
 *
 * "Toggle verified" is not an answer. This says the badge disappears from their
 * listings, because that is the visible consequence and the reason the field exists.
 */
function SellerVerificationDialog({
  row,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  row: AdminSellerRow | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (verified: boolean) => void;
}) {
  if (!row) return null;
  const revoking = row.verified;

  return (
    <AdminConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      subject={`${row.name} — ${row.email}`}
      title={revoking ? "Revoke this seller's verification?" : "Approve this seller?"}
      body={
        revoking ? (
          <p>
            The verified badge disappears from {row.name}'s listings and their profile. Their
            listings, orders and reviews are not touched, and they can be re-approved at any time.
          </p>
        ) : (
          <p>
            {row.name}'s listings will show a verified badge, and customers will see them as a
            trusted seller. They already have {formatAdminCount(row.products)} listing(s) live.
          </p>
        )
      }
      confirmLabel={revoking ? "Revoke verification" : "Approve seller"}
      isSubmitting={isSubmitting}
      onConfirm={() => onConfirm(!revoking)}
    />
  );
}
