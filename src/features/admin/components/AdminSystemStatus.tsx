import type { LucideIcon } from "lucide-react";
import { Database, Server, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAdminHealth } from "../query";
import type { AdminHealth } from "../api";
import { AdminErrorState } from "./AdminErrorState";
import { AdminLoadingState } from "./AdminLoadingState";

/**
 * The dashboard's "System status" block — real probes, or an honest "unavailable".
 *
 * ## What is actually being checked
 *
 *  - **Application**: `GET /api/health` answered at all. The endpoint runs a
 *    `SELECT 1` against MariaDB, so an answer means the process is up *and* talking
 *    to the database; a 503 or a network failure means it is not.
 *  - **Database**: the same response's `database` field. "Connected" is the server's
 *    own word for the `SELECT 1` having succeeded — this component never assumes it.
 *  - **Authentication**: the session that got the administrator this far. The layout
 *    only renders the workspace with a verified ADMIN session, so this reads the
 *    same session state rather than inventing a check.
 *
 * The three rows are the spec's "only show actual status if the backend provides
 * it": nothing here is assumed. If the probe itself failed, the whole block says
 * "System status unavailable" instead of listing guesses.
 */

type Row = { label: string; icon: LucideIcon; value: string; ok: boolean };

function StatusRow({ row }: { row: Row }) {
  const Icon = row.icon;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="soft-button flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground">
        <Icon size={14} aria-hidden />
      </span>
      <span className="text-sm font-bold">{row.label}</span>
      <span
        role="status"
        aria-label={`${row.label}: ${row.value}`}
        className={
          row.ok
            ? "rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-success"
            : "rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-destructive"
        }
      >
        {row.value}
      </span>
    </li>
  );
}

export function AdminSystemStatus() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useAdminHealth();

  if (isLoading && data === undefined) return <AdminLoadingState rows={3} />;

  if (isError && data === undefined) {
    return (
      <AdminErrorState
        label="System status unavailable — the health probe did not answer."
        onRetry={() => void refetch()}
      />
    );
  }

  const applicationOk = (data as AdminHealth | undefined)?.status === "ok";
  const databaseOk = (data as AdminHealth | undefined)?.database === "connected";
  const sessionOk = user !== null;

  const rows: Row[] = [
    { label: "Application", icon: Server, value: applicationOk ? "Online" : "Unavailable", ok: applicationOk },
    { label: "Database", icon: Database, value: databaseOk ? "Connected" : "Unavailable", ok: databaseOk },
    { label: "Authentication", icon: ShieldCheck, value: sessionOk ? "Session active" : "Signed out", ok: sessionOk },
  ];

  return (
    <ul className="divide-y divide-[var(--divider)]">
      {rows.map((row) => (
        <StatusRow key={row.label} row={row} />
      ))}
    </ul>
  );
}