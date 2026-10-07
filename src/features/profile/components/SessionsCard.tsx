import { useState } from "react";
import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLogoutAllMutation } from "@/features/auth/query";

/**
 * "Sign out of every device."
 *
 * ## Why this is a two-step button rather than a dialog
 *
 * The action ends the session the user is reading it from — one click and they
 * are on the homepage, signed out everywhere. That deserves a deliberate act,
 * but not a modal: a Radix dialog would be the heaviest element on an otherwise
 * plain account page, and it exists only to hold a sentence the card can say
 * instead. The first press arms the button and changes its label to the full
 * consequence; the second carries it out. Cancel is simply not pressing again,
 * and focus never leaves the control.
 *
 * `aria-describedby` points at that sentence, so a screen reader announces what
 * the armed button will do rather than a bare "Sign out of all devices" that
 * sounds identical to the single-device one above it.
 *
 * ## Why the count is shown after the fact, not the devices before it
 *
 * The server does not expose a device list, and this card does not invent one.
 * What it reports is the number of sessions the API actually revoked, which is
 * the only figure that comes from the database — a hardcoded "3 devices" would
 * be a decoration that happens to be a lie on someone else's account.
 */
export function SessionsCard() {
  const navigate = useNavigate();
  const logoutAll = useLogoutAllMutation();
  const [armed, setArmed] = useState(false);
  const [revoked, setRevoked] = useState<number | null>(null);

  const pending = logoutAll.isPending;
  const hintId = "sign-out-all-hint";

  async function handleSignOutEverywhere() {
    if (!armed) {
      setArmed(true);
      return;
    }
    try {
      const result = await logoutAll.mutateAsync();
      setRevoked(result.revokedSessions);
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

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold">
          <MonitorSmartphone size={18} aria-hidden />
          Signed-in devices
        </h2>
        <p className="text-sm text-muted-foreground">
          Each device keeps its own session — laptop, phone, tablet. Ending them all signs you out
          here too, and is the right move if you signed in somewhere you no longer have.
        </p>
      </div>

      {revoked !== null && (
        <p role="status" className="text-xs font-bold text-accent">
          Last sign-out ended {revoked} {revoked === 1 ? "session" : "sessions"}.
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
          {pending ? (
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
        {armed && !pending && (
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
