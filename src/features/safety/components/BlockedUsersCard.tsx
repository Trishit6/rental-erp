import { ShieldOff, UserX } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBlockedUsers, useUnblockUser } from "../query";

/**
 * The blocked-accounts list on `/settings`.
 *
 * ## Why the list is the management surface
 *
 * A block can be placed in two places — a thread header and this page — and only
 * one of them is a place a user thinks to revisit. The thread is where the impulse
 * happens; the settings list is where the decision is *stored* and where a wrong
 * one is undone. Both read `queryKeys.blockedUsers`, so the two never disagree.
 *
 * The note a blocker wrote is shown back to them and to no one else; the server
 * never returns it to the blocked account.
 */
export function BlockedUsersCard() {
  const { data, isLoading, isError, error, refetch } = useBlockedUsers();
  const unblock = useUnblockUser();

  return (
    <Card className="space-y-5 p-6" data-testid="blocked-users-card">
      <div>
        <h2 className="flex items-center gap-2 section-title text-lg">
          <UserX size={17} aria-hidden className="text-primary" />
          Blocked accounts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Blocked accounts cannot message you. Blocking never hides their listings or ends an
          existing order — only new messages are refused.
        </p>
      </div>

      {isLoading ? (
        <ul className="space-y-2" aria-hidden data-testid="blocked-users-skeleton">
          {[0, 1].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-2xl bg-muted/60" />
          ))}
        </ul>
      ) : isError ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm">
          <p className="font-semibold text-destructive" role="alert">
            {error instanceof Error ? error.message : "Could not load your blocked accounts."}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : data && data.length > 0 ? (
        <ul className="divide-y divide-border/60" data-testid="blocked-users-list">
          {data.map((account) => (
            <li key={account.id} className="flex items-center gap-3 py-3">
              <Avatar name={account.name} url={account.avatarUrl} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{account.name}</p>
                {account.reason ? (
                  <p className="truncate text-xs text-muted-foreground">Note: {account.reason}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Blocked {new Date(account.blockedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={unblock.isPending && unblock.variables === account.id}
                onClick={() => unblock.mutate(account.id)}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="flex items-center gap-3 rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground"
          data-testid="blocked-users-empty"
        >
          <ShieldOff size={16} aria-hidden className="shrink-0" />
          <p>
            You haven&apos;t blocked anyone. If an account is bothering you, block them from your
            messages.
          </p>
        </div>
      )}
    </Card>
  );
}
