import { format } from "date-fns";
import { BadgeCheck, LogOut, Mail, ShieldCheck, User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLogoutMutation } from "@/features/auth/query";
import { homeFor } from "@/lib/auth/guards";
import type { User as AccountUser } from "@/features/auth/types";

/**
 * The read-only account facts, plus the actions that apply to the whole account.
 *
 * ## What is here and what is deliberately not
 *
 * Everything shown is a field of the signed-in user's own row, as resolved by the server
 * from the session — no client-side "am I an admin?" guess, no count derived from another
 * endpoint, nothing that could disagree with the database.
 *
 * The role is displayed but not editable, and there is no control anywhere on this page
 * that could change it. That is not a hidden button: the server's update schema is a
 * whitelist that does not contain `role`, so a crafted request is refused rather than
 * ignored — and a control that merely *looked* editable would be a lie.
 */
export function AccountCard({ user }: { user: AccountUser }) {
  const navigate = useNavigate();
  const logout = useLogoutMutation();

  const memberSince = formatSince(user.createdAt);

  async function handleLogout() {
    try {
      await logout.mutateAsync();
      toast.success("Signed out. See you soon!");
    } catch {
      // `useLogoutMutation` clears client state even when the request fails, because the
      // server deletes the session before it replies. So this is a message about the
      // request, not a state the user can be stranded in — and returning to the public
      // area is correct on both paths, since staying put would leave them on a guarded
      // route that now redirects them with an expiry message they did not trigger.
      toast.error("Signed out on this device. We couldn't reach the server to confirm.");
    }
    void navigate({ to: "/" });
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar
          name={user.name}
          url={user.avatarUrl}
          fallback={<User size={24} aria-hidden />}
          className="size-16 text-xl"
        />
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-extrabold">{user.name}</p>
          <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
            <Mail size={14} aria-hidden className="shrink-0" />
            {user.email}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-accent">
            {user.role === "ADMIN" ? (
              <ShieldCheck size={13} aria-hidden />
            ) : (
              <BadgeCheck size={13} aria-hidden />
            )}
            {user.role === "ADMIN" ? "Administrator" : user.role === "SELLER" ? "Seller" : "Customer"}
            {user.verified && (
              <span className="font-semibold text-muted-foreground">· Verified</span>
            )}
          </p>
        </div>
      </div>

      <dl className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Account type
          </dt>
          <dd className="mt-0.5 font-semibold">
            {user.role === "ADMIN"
              ? "Administrator — full access"
              : user.role === "SELLER"
                ? "Seller — listings, orders and payouts"
                : "Customer — buying and renting"}
          </dd>
        </div>
        {/* The label goes with the value. A "Member since" heading over an empty cell reads
            as a date that failed to load, which is a different and more alarming thing than
            the server simply not having sent one. */}
        {memberSince && (
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Member since
            </dt>
            <dd className="mt-0.5 font-semibold">{memberSince}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={() => void navigate({ to: homeFor(user) })}>
          Go to my dashboard
        </Button>
        <Button type="button" variant="ghost" disabled={logout.isPending} onClick={() => void handleLogout()}>
          <LogOut size={15} aria-hidden />
          {logout.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </Card>
  );
}

/**
 * "Member since", or nothing at all.
 *
 * `createdAt` is optional in the wire type and absent from some responses, so this returns
 * `null` rather than formatting `undefined` into "Invalid Date" — a value that would sit on
 * the page looking like data.
 */
function formatSince(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "MMMM yyyy");
}