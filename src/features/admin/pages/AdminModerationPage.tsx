import { useState } from "react";
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
import { AdminReportsList } from "../components/AdminReportsList";
import { useAdminActions, useAdminUsers } from "../query";

/**
 * `/admin/moderation` — reports, reviews and suspended accounts.
 *
 * ## This is the old tabbed admin page, kept
 *
 * The previous `/admin` held user suspension, report resolution and review
 * moderation behind a tab strip. Moving the catalogue out to its own route must not
 * cost those three capabilities, so they live here, with the same behaviour and the
 * same hooks. The only thing that changed is the presentation: the hand-written
 * `<table>` elements are now the shared `Table` primitives, so the scroll container
 * and header styling match the catalogue.
 *
 * Nothing here writes to financial history — suspension and moderation status are
 * the only things these controls can change.
 */

type Tab = "reports" | "reviews" | "users";

const TABS: { key: Tab; label: string; icon: typeof Flag }[] = [
  { key: "reports", label: "Reports", icon: Flag },
  { key: "reviews", label: "Reviews", icon: ShieldAlert },
  { key: "users", label: "Users", icon: Users },
];

export function AdminModerationPage() {
  const [tab, setTab] = useState<Tab>("reports");
  const { data: users } = useAdminUsers(tab === "users");
  const { suspendUser } = useAdminActions();

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Revaro admin"
        title="Moderation"
        description="Reported listings, published reviews and account access."
      />

      <nav className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? "default" : "secondary"}
            onClick={() => setTab(key)}
          >
            <Icon size={14} aria-hidden />
            {label}
          </Button>
        ))}
      </nav>

      {tab === "reports" && <AdminReportsList />}

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
                            onClick={() => void suspendUser(user.id, true)}
                          >
                            <Ban size={13} aria-hidden /> Suspend
                          </Button>
                        ) : user.role === "SUSPENDED" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void suspendUser(user.id, false)}
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
    </div>
  );
}
