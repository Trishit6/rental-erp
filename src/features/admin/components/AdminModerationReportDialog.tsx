import { useState } from "react";
import { Flag, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import { useAdminModerationDecision, useAdminModerationReportDetail } from "../query";
import {
  MODERATION_ACTION_LABELS,
  moderationActionsForTarget,
  type ModerationAction,
} from "../api";
import { formatAdminDateTime, humanizeEnum } from "./format";

/**
 * One report, its target and its history, with the decision form.
 *
 * ## Context is the point
 *
 * A moderator reading "reason: INAPPROPRIATE / details: 'this is horrible'" cannot
 * act without knowing *what* was reported to whom, so the target headline and the
 * reporter are on screen. The history is read from the audit log, which is where
 * every previous decision about this report already lives — there is no second
 * history table to drift out of step with it.
 *
 * ## Deciding *is* acting
 *
 * Choosing "hide the listing" and confirming does both in one request: the report
 * is marked resolved and the target changes. The server enforces the pairing and
 * requires a reason, a step-up and an audit entry, so nothing here can decide
 * silently.
 */
const REPORT_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-warning/15 text-warning",
  IN_REVIEW: "bg-info/15 text-info",
  RESOLVED: "bg-success/15 text-success",
  DISMISSED: "bg-muted text-muted-foreground",
};

const TARGET_LABEL: Record<string, string> = {
  product: "Listing",
  user: "Account",
  review: "Review",
  message: "Message",
  order: "Order",
  rental: "Rental",
};

export function AdminModerationReportDialog({
  reportId,
  open,
  onOpenChange,
}: {
  reportId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useAdminModerationReportDetail(open ? reportId : null);
  const decide = useAdminModerationDecision();
  const [action, setAction] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState("");

  const data = detail.data;
  const options = moderationActionsForTarget(data?.target.type ?? "");
  const chosen =
    action && options.includes(action) ? action : (options[0] ?? "RESOLVED");
  const terminal = data !== undefined && ["RESOLVED", "DISMISSED"].includes(data.report.status);
  const canSubmit = reason.trim().length >= 3 && !decide.isPending;

  function submit() {
    if (!data) return;
    void decide
      .mutateAsync({ id: data.report.id, input: { action: chosen, reason } })
      .then(() => setReason(""))
      .catch(() => undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Flag size={16} aria-hidden className="text-muted-foreground" />
            <span>Report #{data?.report.id ?? ""}</span>
            {data ? (
              <Badge
                className={cn(
                  "whitespace-nowrap",
                  REPORT_STATUS_BADGE[data.report.status] ?? "bg-muted text-muted-foreground",
                )}
              >
                {humanizeEnum(data.report.status)}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {data
              ? `Filed by ${data.reporter.name} · ${formatAdminDateTime(data.report.createdAt)}`
              : "Loading the report…"}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && !data ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : detail.isError || !data ? (
          <div className="py-4 text-sm text-destructive" role="alert">
            This report could not be loaded.
          </div>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Field
                label={TARGET_LABEL[data.target.type] ?? "Target"}
                value={data.target.headline}
              />
              <Field label="Reported by" value={`${data.reporter.name} · ${data.reporter.email}`} />
            </section>

            <section>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Reason
              </h3>
              <p className="text-sm font-semibold">{humanizeEnum(data.report.reason)}</p>
              {data.report.details ? (
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {data.report.details}
                </p>
              ) : null}
            </section>

            {terminal ? (
              <section className="rounded-xl bg-muted/50 p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <ShieldCheck size={14} aria-hidden /> Decision
                </h3>
                <p className="mt-1 text-sm font-semibold">
                  {MODERATION_ACTION_LABELS[data.report.action as ModerationAction] ??
                    humanizeEnum(data.report.action ?? data.report.status)}
                </p>
                {data.report.actionNote ? (
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                    {data.report.actionNote}
                  </p>
                ) : null}
                {data.resolvedBy ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Decided by {data.resolvedBy.name}
                    {data.report.resolvedAt
                      ? ` · ${formatAdminDateTime(data.report.resolvedAt)}`
                      : ""}
                  </p>
                ) : null}
              </section>
            ) : (
              <section className="space-y-3 rounded-xl border border-[var(--divider)] p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Decision
                </h3>
                <NativeSelect
                  label="Decision"
                  value={chosen}
                  onChange={(event) => setAction(event.target.value as ModerationAction)}
                  options={options.map((value) => ({
                    value,
                    label: MODERATION_ACTION_LABELS[value],
                  }))}
                />
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why? Written to the audit log and sent to the reporter."
                  rows={3}
                  maxLength={500}
                />
                <div className="flex justify-end">
                  <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
                    {decide.isPending ? (
                      <Loader2 size={14} aria-hidden className="animate-spin" />
                    ) : null}
                    Record decision
                  </Button>
                </div>
              </section>
            )}

            {data.history.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  History
                </h3>
                <ol className="space-y-2">
                  {data.history.map((entry) => (
                    <li key={entry.id} className="rounded-xl bg-muted/40 px-3 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">{humanizeEnum(entry.action)}</span>
                        <span className="text-xs text-muted-foreground">
                          {entry.adminName ?? "Staff"}
                          {entry.actorRole ? ` · ${entry.actorRole}` : ""} ·{" "}
                          {formatAdminDateTime(entry.createdAt)}
                        </span>
                      </div>
                      {entry.reason || entry.details ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {entry.reason ?? entry.details}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}
