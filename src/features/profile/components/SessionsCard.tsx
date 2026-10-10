import { useState } from "react";
import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLogoutAllMutation, useRevokeSessionMutation, useSessionsQuery } from "@/features/auth/query";

/**
 * The device list and "sign out of every device."
 *
 * ## Why the list is real, not decorative
 *
 * `GET /auth/sessions` returns the account's live sessions — the id, the device
 * label the server derived from the user agent, the last-seen time and whether
 * the row is *this* browser. Rendering those rows is what makes the revoke
 * buttons meaningful: each one deletes exactly one session server-side.
 *
 * ## Why the current session is labelled, and its revoke button navigates away
 *
 * Revoking the current session is a sign-out (the server clears the cookies),
 * so the mutation ends client state the same way a logout does and the page
 * leaves for `/`. Revoking any other device just refetches the list.
 *
 * ## Why the "sign out everywhere" button stays
 *
 * The old card's two-step arm-then-confirm remains: it ends *every* session,
 * this one included, which deserves a deliberate act rather than a row-level
 * click. The list above it is the per-device counterpart — "end the laptop I
 * left at the office" without nuking the phone in your pocket.
 */
/**
 * Absolute timestamps, not "5m ago" — a relative clock would read `Date.now()`
 * during render, which the purity rule forbids (and which re-renders would
 * silently redraw). The account page has no ticking deadline, so a stable
 * formatted time is the honest display.
 */
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function SessionsCard() {
  const navigate = useNavigate();
  const sessions = useSessionsQuery();
  const logoutAll = useLogoutAllMutation();
  const revoke = useRevokeSessionMutation();
  const [armed, setArmed] = useState(false);

  const pending = logoutAll.isPending || revoke.isPending;
  const hintId = "sign-out-all-hint";

  async function handleSignOutEverywhere() {
    if (!armed) {
      setArmed(true);
      return;
    }
    try {
      const result = await logoutAll.mutateAsync();
      toast.success(
        result.revokedSessions > 0
          ? `Signed out everywhere — ${result.revokedSessions} ${
              result.revokedSessions === 1 ? "session" : "sessions"
            } ended.`
          : "Signed out everywhere.",
      );
    } catch {
      // `useLogoutAllMutation` clears client state even when the request fails,
      // because the server revokes the sessions before it replies — the same
      // reasoning as the single-device sign-out in `AccountCard`. The message is
      // about the request, not a state anyone can be stranded in, and going
      // home is correct either way: staying would leave them on a guarded route
      // that is about to redirect them with an expiry message they did not ask
      // for.
      toast.error("Signed out here. We couldn't reach the server to confirm the other devices.");
    }
    void navigate({ to: "/" });
  }

  async function handleRevoke(sessionId: string) {
    const row = sessions.data?.find((s) => s.id === sessionId);
    try {
      await revoke.mutateAsync(sessionId);
      if (row?.current) {
        toast.success("Signed out of this device.");
        void navigate({ to: "/" });
      } else {
        toast.success("That device has been signed out.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to end that session. Try again.");
    }
  }

  function lastSeen(iso: string | null): string {
    if (!iso || Number.isNaN(new Date(iso).getTime())) return "never";
    return timeFormatter.format(new Date(iso));
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold">
          <MonitorSmartphone size={18} aria-hidden />
          Signed-in devices
        </h2>
        <p className="text-sm text-muted-foreground">
          Each device keeps its own session — laptop, phone, tablet. End one device, or end them
          all.
        </p>
      </div>

      {sessions.isLoading ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 size={15} className="animate-spin" aria-hidden />
          Reading your devices…
        </p>
      ) : sessions.data && sessions.data.length > 0 ? (
        <ul className="divide-y divide-border">
          {sessions.data.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {session.deviceLabel || "Browser"}
                  {session.current && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary">
                      This device
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Seen {lastSeen(session.lastSeenAt)}
                  {session.ip ? ` · ${session.ip}` : ""}
                  {session.mfaVerified ? " · MFA verified" : ""}
                </p>
              </div>
              {!session.current && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => void handleRevoke(session.id)}
                >
                  <LogOut size={14} aria-hidden />
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          No live sessions on record.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant={armed ? "destructive" : "secondary"}
          disabled={pending}
          aria-describedby={hintId}
          onClick={() => void handleSignOutEverywhere()}
        >
          {logoutAll.isPending ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden />
              Signing out everywhere…
            </>
          ) : armed ? (
            <>
              <LogOut size={15} aria-hidden />
              Yes, sign out everywhere
            </>
          ) : (
            <>
              <LogOut size={15} aria-hidden />
              Sign out of all devices
            </>
          )}
        </Button>
        {armed && !logoutAll.isPending && (
          <Button type="button" variant="ghost" onClick={() => setArmed(false)}>
            Cancel
          </Button>
        )}
        <p id={hintId} className="text-xs text-muted-foreground">
          {armed
            ? "This ends every session for your account, including this one."
            : "You'll be signed out on every device, including this one."}
        </p>
      </div>
    </Card>
  );
}