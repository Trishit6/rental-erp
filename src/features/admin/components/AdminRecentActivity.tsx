import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  Flag,
  Handshake,
  MessageSquareQuote,
  Package,
  ScrollText,
  ShoppingCart,
  Store,
  Tag,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { useAdminAuditLog } from "../query";
import { EMPTY_ADMIN_AUDIT_FILTERS } from "../api";
import { formatAdminDateTime } from "./format";
import { AdminErrorState } from "./AdminErrorState";
import { AdminLoadingState } from "./AdminLoadingState";

/**
 * The dashboard's "Recent activity" block — the most recent audit rows.
 *
 * ## Where the rows come from
 *
 * This is the same `admin_audit_log` table and the same endpoint as
 * `/admin/audit-logs`, asked for its smallest page. Every row has already been
 * written by an action that performed it, so "who did what recently" is real
 * history, not a synthetic feed. When the log is empty the block says so — it never
 * prints activities that did not happen.
 */

const ENTITY_ICONS: Record<string, LucideIcon> = {
  product: Package,
  order: ShoppingCart,
  rental: Handshake,
  user: Users,
  seller: Store,
  review: MessageSquareQuote,
  category: Tag,
  image: Package,
  payout: CreditCard,
  report: Flag,
};

export function AdminRecentActivity() {
  const { data, isError, isLoading, refetch } = useAdminAuditLog({
    ...EMPTY_ADMIN_AUDIT_FILTERS,
    pageSize: 6,
  });

  if (isLoading && data === undefined) return <AdminLoadingState rows={3} />;

  if (isError && data === undefined) {
    return <AdminErrorState label="Couldn’t load recent activity." onRetry={() => void refetch()} />;
  }

  const rows = data?.rows ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No recorded activity yet"
        description="Actions by administrators appear here as they happen."
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--divider)]">
      {rows.map((row) => {
        const Icon = ENTITY_ICONS[row.entityType] ?? ScrollText;
        return (
          <li key={row.id} className="flex items-start gap-3 py-3">
            <span className="soft-button flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon size={14} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{row.details ?? row.action}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.adminName} · {row.entityType}
                {row.entityId !== null ? ` #${row.entityId}` : ""}
              </p>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={row.createdAt}>
              {formatAdminDateTime(row.createdAt)}
            </time>
          </li>
        );
      })}
      <li className="pt-2">
        <Link
          to="/admin/audit-logs"
          className="block rounded-xl px-2 py-2 text-center text-xs font-bold text-primary transition hover:bg-primary/10"
        >
          View full audit log
        </Link>
      </li>
    </ul>
  );
}