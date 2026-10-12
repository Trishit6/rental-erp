import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Flag, ShieldAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ModerationSection } from "@/features/reviews";
import { AdminPageHeader } from "../components/AdminLayout";
import { AdminFlagWordsCard } from "../components/AdminFlagWordsCard";
import { AdminReportsList } from "../components/AdminReportsList";
import { AdminConfirmDialog } from "../components/AdminConfirmDialog";
import { useAdminAccess, useAdminActions, useAdminUsers } from "../query";

/**
 * `/admin/moderation` — the moderation hub (PROMPT 29).
 *
 * ## Reports, reviews and account access, behind one tab strip
 *
 * Three queues that share a decision-maker but not a data shape: the *reports* queue
 * (one work item per filed report, with linked actions), the *reviews* queue (the
 * shared review moderation surface) and the *users* queue (suspend/restore). The
 * Reports tab is the hub's centre of gravity — it is where a report becomes an
 * outcome — and the other two stay because moving the catalogue out to its own route
 * must not cost capabilities that used to live on `/admin`.
 *
 * ## Keyboard shortcuts
 *
 * A moderator works this screen all day, so `1`/`2`/`3` select a tab without a trip
 * to the mouse. The keys are inert inside a text field: typing "1" into a reason must
 * not jump tabs, so the handler ignores events from inputs and textareas.
 *
 * ## Account suspension here is the blunt tool
 *
 * The Users tab suspends and restores an account. It is audited with a mandatory
 * reason (PROMPT 22); the row button opens a dialog that collects it rather than firing
 * immediately. Nothing on this page writes to financial history.
 */

type Tab = "reports" | "reviews" | "users";

const TABS: { key: Tab; label: string; icon: typeof Flag; hotkey: string }[] = [
  { key: "reports", label: "Reports", icon: Flag, hotkey: "1" },
  { key: "reviews", label: "Reviews", icon: ShieldAlert, hotkey: "2" },
  { key: "users", label: "Users", icon: Users, hotkey: "3" },
];

export function AdminModerationPage() {
  const [tab, setTab] = useState<Tab>("reports");
  const { data: access } = useAdminAccess();
  const { data: users } = useAdminUsers(tab === "users");
  const { suspendUser } = useAdminActions();
  const [suspendTarget, setSuspendTarget] = useState<{
    id: number;
    name: string;
    suspend: boolean;
  } | null>(null);
  const [suspending, setSuspending] = useState(false);

  // `1`/`2`/`3` switch tabs, unless the keystroke is meant for a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      const match = TABS.find((entry) => entry.hotkey === event.key);
      if (match) setTab(match.key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const canManageFlagWords = access?.permissions.includes("settings.manage") ?? false;

  /**
   * The account actions here are audited with a mandatory reason (PROMPT 22), so
   * the row button opens a dialog that collects it rather than firing immediately.
   */
  async function confirmSuspension(reason: string) {
    if (!suspendTarget) return;
    setSuspending(true);
    try {
      await suspendUser(suspendTarget.id, suspendTarget.suspend, reason);
      setSuspendTarget(null);
    } finally {
      setSuspending(false);
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Revaro admin"
        title="Moderation"
        description="Reported listings, published reviews and account access."
      />

      <nav className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon, hotkey }) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? "default" : "secondary"}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            <Icon size={14} aria-hidden />
            {label}
            <kbd className="ml-1 rounded border border-current/30 px-1 text-[10px] font-bold opacity-70">
              {hotkey}
            </kbd>
          </Button>
        ))}
      </nav>

      {tab === "reports" && (
        <div className="space-y-4">
          {canManageFlagWords ? <AdminFlagWordsCard /> : null}
          <AdminReportsList />
        </div>
      )}

      {tab === "reviews" && <ModerationSection />}

      {tab === "users" && (
        <Card className="overflow-hidden p-0">
          {users === undefined ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading users…</p>
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users"
              description="Accounts appear here as soon as people sign up."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-bold">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          user.role === "SUSPENDED" ? "bg-destructive/10 text-destructive" : ""
                        }
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {user.role === "USER" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setSuspendTarget({ id: user.id, name: user.name, suspend: true })
                            }
                          >
                            <Ban size={13} aria-hidden /> Suspend
                          </Button>
                        ) : user.role === "SUSPENDED" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setSuspendTarget({ id: user.id, name: user.name, suspend: false })
                            }
                          >
                            <CheckCircle2 size={13} aria-hidden /> Restore
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <AdminConfirmDialog
        open={suspendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSuspendTarget(null);
        }}
        subject={suspendTarget ? suspendTarget.name : ""}
        title={suspendTarget?.suspend ? "Suspend this account?" : "Restore this account?"}
        requireReason
        reasonLabel={suspendTarget?.suspend ? "Reason for suspending" : "Reason for restoring"}
        body={
          <p>
            {suspendTarget?.suspend
              ? "They will be signed out and blocked from signing in, buying, renting and messaging."
              : "They will be able to use their account again."}
          </p>
        }
        confirmLabel={suspendTarget?.suspend ? "Suspend account" : "Restore access"}
        tone={suspendTarget?.suspend ? "destructive" : "default"}
        isSubmitting={suspending}
        onConfirm={(reason) => void confirmSuspension(reason)}
      />
    </div>
  );
}
