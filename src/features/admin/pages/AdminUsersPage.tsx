import { useState } from "react";
import { Ban, CheckCircle2, Users } from "lucide-react";
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
import { formatAdminCount, formatAdminDate, humanizeEnum } from "../components/format";
import { MODERATION_STATUS_BADGE, NEUTRAL_BADGE } from "../components/status-badge";
import { useAdminUserSuspension, useAdminWorkspaceUsers } from "../query";
import { EMPTY_ADMIN_USER_FILTERS, type AdminWorkspaceUserRow } from "../api";

/**
 * `/admin/users` — every account in the marketplace.
 *
 * ## This is not the moderation queue
 *
 * `/admin/moderation` still shows a short list of accounts with a Suspend button, and
 * it is deliberately left alone: that page's job is "something needs a decision", which
 * is a different list from "everyone". This one is the searchable, filterable,
 * paged directory — and it is the only place suspension happens from a table where the
 * full role, seller status and activity counts are visible.
 *
 * Suspension goes through the shared `AdminConfirmDialog`, not a bare button: it takes
 * an account's access away, and the confirmation has to name the account losing it
 * before it happens. Restoring is reversible, so it confirms too — but in the neutral
 * tone, because a mistake there costs nothing.
 */

const ROLE_OPTIONS = [
  { value: "", label: "Every role" },
  { value: "USER", label: "Customers" },
  { value: "SELLER", label: "Sellers" },
  { value: "ADMIN", label: "Admins" },
  { value: "SUSPENDED", label: "Suspended" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "By name" },
];

export function AdminUsersPage() {
  const [filters, setFilters] = useState(EMPTY_ADMIN_USER_FILTERS);
  const users = useAdminWorkspaceUsers(filters);
  const suspension = useAdminUserSuspension();
  const confirm = useConfirmTarget<AdminWorkspaceUserRow>();

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = users.data?.rows ?? [];
  const hasFilters = filters.search !== "" || filters.role !== null;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Users"
        title="Customers"
        description="Every account, with its orders, rentals and seller status. Counts come from the database, not a stored total."
      />

      <AdminTableScaffold
        icon={Users}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={users.isFetching && !users.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_USER_FILTERS })}
        filters={[
          {
            key: "role",
            label: "Role",
            value: filters.role ?? "",
            onChange: (value) => update({ role: value || null }),
            options: ROLE_OPTIONS,
          },
          {
            key: "sort",
            label: "Sort",
            value: filters.sort,
            onChange: (value) => update({ sort: value }),
            options: SORT_OPTIONS,
          },
        ]}
        count={users.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={users.isLoading && !users.data}
        isError={users.isError}
        onRetry={() => void users.refetch()}
        emptyTitle={hasFilters ? "No accounts match" : "No accounts yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try a different role or clear the search."
            : "Accounts appear here as soon as someone signs up."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={users.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={["Name", "Email", "Role", "Seller", "Orders", "Rentals", "Joined", "Actions"]}
          />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-56 truncate font-semibold">{row.name}</TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">
                  {row.email}
                </TableCell>
                <TableCell>
                  <Badge className={`whitespace-nowrap ${MODERATION_STATUS_BADGE[row.role] ?? NEUTRAL_BADGE}`}>
                    {humanizeEnum(row.role)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.isSeller ? (
                    <Badge
                      className={`whitespace-nowrap ${row.sellerVerified ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                    >
                      {row.sellerVerified ? "Verified seller" : "Unverified seller"}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{formatAdminCount(row.orders)}</TableCell>
                <TableCell className="tabular-nums">{formatAdminCount(row.rentals)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatAdminDate(row.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <AccountAction
                      row={row}
                      disabled={suspension.isPending}
                      onRequest={() => confirm.request(row)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>

      <AccountSuspensionDialog
        row={confirm.target}
        isSubmitting={suspension.isPending}
        onCancel={confirm.close}
        onConfirm={(suspend) => {
          if (!confirm.target) return;
          const id = confirm.target.id;
          suspension.mutate({ id, suspend }, { onSettled: confirm.close });
        }}
      />
    </div>
  );
}

/**
 * Suspend, restore, or nothing.
 *
 * An `ADMIN` row has no button on purpose. There is no endpoint that protects an
 * administrator from being suspended by another administrator, so offering the button
 * would be a control that either does nothing or locks everyone out — neither of which
 * belongs in a table.
 */
function AccountAction({
  row,
  disabled,
  onRequest,
}: {
  row: AdminWorkspaceUserRow;
  disabled: boolean;
  onRequest: () => void;
}) {
  if (row.role === "ADMIN") {
    return <span className="text-xs text-muted-foreground">Protected</span>;
  }
  if (row.role === "SUSPENDED") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        disabled={disabled}
        onClick={onRequest}
      >
        <CheckCircle2 size={14} aria-hidden />
        Restore
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 px-2"
      disabled={disabled}
      onClick={onRequest}
    >
      <Ban size={14} aria-hidden />
      Suspend
    </Button>
  );
}

/**
 * The suspend/restore confirmation, worded for whichever way it is going.
 *
 * The two directions are not the same dialog with a swapped verb. Suspending tells the
 * admin what actually stops (sign-in, checkout, messaging — and that their listings stay
 * visible, because suspension is an *account* action and hiding a seller's catalogue
 * would destroy their revenue without telling them). Restoring says only that access
 * comes back, in the neutral tone, because a wrong restore costs nothing.
 */
function AccountSuspensionDialog({
  row,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  row: AdminWorkspaceUserRow | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (suspend: boolean) => void;
}) {
  if (!row) return null;
  const restoring = row.role === "SUSPENDED";

  return (
    <AdminConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      subject={`${row.name} — ${row.email}`}
      title={restoring ? "Restore this account?" : "Suspend this account?"}
      body={
        restoring ? (
          <p>
            {row.name} will be able to sign in, buy, rent and message sellers again.
            {row.orders > 0 || row.rentals > 0
              ? ` Their ${row.orders} order(s) and ${row.rentals} rental(s) are unaffected.`
              : null}
          </p>
        ) : (
          <p>
            {row.name} will be signed out and blocked from signing in, buying, renting and
            messaging.
            {row.isSeller
              ? " Their listings stay online and their existing orders continue — suspension is an account action, not a delisting."
              : null}
          </p>
        )
      }
      confirmLabel={restoring ? "Restore access" : "Suspend account"}
      tone={restoring ? "default" : "destructive"}
      isSubmitting={isSubmitting}
      onConfirm={() => onConfirm(restoring ? false : true)}
    />
  );
}
