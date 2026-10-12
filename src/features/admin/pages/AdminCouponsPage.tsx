import { useState } from "react";
import { Percent, Plus } from "lucide-react";
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
import { AdminCouponDialog } from "../components/AdminCouponDialog";
import {
  formatAdminCount,
  formatAdminDate,
  formatAdminMoney,
  humanizeEnum,
} from "../components/format";
import { COUPON_STATUS_BADGE, NEUTRAL_BADGE } from "../components/status-badge";
import {
  useAdminAccess,
  useAdminCoupons,
  useAdminCouponStatusMutation,
  useAdminSearchFilters,
} from "../query";
import {
  COUPON_DISCOUNT_TYPES,
  COUPON_DISCOUNT_TYPE_LABELS,
  COUPON_SCOPE_LABELS,
  COUPON_STATUSES,
  COUPON_STATUS_LABELS,
  EMPTY_ADMIN_COUPON_FILTERS,
  type AdminCouponRow,
  type AdminCouponScope,
  type AdminCouponStatus,
} from "../api";

/**
 * `/admin/coupons` — the coupon desk (PROMPT 31).
 *
 * ## What this screen is, and what it is not
 *
 * This is the *administration* of discount codes: their terms, their window, their
 * usage and who redeemed them. It is deliberately not the checkout integration — that
 * is a change to the pricing path the brief for this prompt does not touch. The list
 * therefore reports `redemptionCount` honestly, which will read `0` for every coupon
 * until redemption is wired at checkout.
 *
 * ## Actions are gated on the permission that authorises them
 *
 * The page is reachable with `coupons.view`, so a FINANCE account can audit the codes
 * and their redemptions. Creating, editing and pausing need `coupons.manage`; the
 * controls for those are hidden without it, and the server refuses them regardless.
 */
const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  ...COUPON_STATUSES.map((value) => ({ value, label: COUPON_STATUS_LABELS[value] })),
];

const TYPE_OPTIONS = [
  { value: "", label: "Any type" },
  ...COUPON_DISCOUNT_TYPES.map((value) => ({ value, label: COUPON_DISCOUNT_TYPE_LABELS[value] })),
];

export function AdminCouponsPage() {
  const [filters, setFilters] = useAdminSearchFilters(EMPTY_ADMIN_COUPON_FILTERS);
  const coupons = useAdminCoupons(filters);
  const access = useAdminAccess();
  const canManage = access.data?.permissions.includes("coupons.manage") ?? false;

  const [dialogId, setDialogId] = useState<number | null | undefined>(undefined);
  const statusMutation = useAdminCouponStatusMutation();

  const rows = coupons.data?.rows ?? [];
  const hasFilters =
    filters.search !== "" || filters.status !== null || filters.discountType !== null;

  function update(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch, page: 1 }));
  }

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Marketplace"
        title="Coupons"
        description="Discount codes, their terms and their redemption history."
        actions={
          canManage ? (
            <Button type="button" onClick={() => setDialogId(null)}>
              <Plus size={15} aria-hidden />
              New coupon
            </Button>
          ) : null
        }
      />

      <AdminTableScaffold
        icon={Percent}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={coupons.isFetching && !coupons.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_COUPON_FILTERS })}
        filters={[
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: STATUS_OPTIONS,
          },
          {
            key: "discountType",
            label: "Type",
            value: filters.discountType ?? "",
            onChange: (value) => update({ discountType: value || null }),
            options: TYPE_OPTIONS,
          },
        ]}
        count={coupons.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={coupons.isLoading && !coupons.data}
        isError={coupons.isError}
        onRetry={() => void coupons.refetch()}
        emptyTitle={hasFilters ? "Nothing matches" : "No coupons yet"}
        emptyDescription={
          hasFilters
            ? "No coupons match these filters. Try clearing one."
            : "Create a code to run a promotion."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={coupons.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead labels={["Code", "Discount", "Scope", "Usage", "Status", "Window", ""]} />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-56">
                  <p className="font-semibold tracking-wide">{row.code}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {row.description ?? "No description"}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap">{discountText(row)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {
                    COUPON_SCOPE_LABELS[
                      (row.appliesTo === "CATEGORY" ? "CATEGORY" : "ALL") as AdminCouponScope
                    ]
                  }
                  {row.categoryName ? ` · ${row.categoryName}` : ""}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <p>
                    {formatAdminCount(row.usedCount)}
                    {row.usageLimit == null ? "" : ` / ${formatAdminCount(row.usageLimit)}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatAdminCount(row.redemptionCount)} redeemed
                  </p>
                </TableCell>
                <TableCell>
                  <Badge
                    className={`whitespace-nowrap ${COUPON_STATUS_BADGE[row.status] ?? NEUTRAL_BADGE}`}
                  >
                    {COUPON_STATUS_LABELS[row.status as AdminCouponStatus] ??
                      humanizeEnum(row.status)}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.startsAt ? formatAdminDate(row.startsAt) : "Now"} →{" "}
                  {row.endsAt ? formatAdminDate(row.endsAt) : "no end"}
                </TableCell>
                <TableCell className="text-right">
                  {canManage ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            id: row.id,
                            status: row.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                          })
                        }
                      >
                        {row.status === "ACTIVE" ? "Pause" : "Activate"}
                      </Button>
                      <Button type="button" size="sm" onClick={() => setDialogId(row.id)}>
                        Edit
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>

      <AdminCouponDialog
        couponId={dialogId ?? null}
        open={dialogId !== undefined}
        onOpenChange={(open) => {
          if (!open) setDialogId(undefined);
        }}
      />
    </div>
  );
}

/** The discount as an operator reads it: `10% up to ₹500`, or `₹200 off`. */
function discountText(row: AdminCouponRow): string {
  if (row.discountType === "PERCENT") {
    const percent = row.discountValue / 100;
    const cap = row.maxDiscountPaise == null ? null : formatAdminMoney(row.maxDiscountPaise, "INR");
    return cap ? `${percent}% up to ${cap}` : `${percent}%`;
  }
  return `${formatAdminMoney(row.discountValue, "INR")} off`;
}
