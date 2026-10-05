import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useNotificationPreferences, useSaveNotificationPreferences } from "../query";
import type { NotificationChannel, NotificationPreferences, PreferenceKey } from "../types";
import { PREFERENCE_GROUPS } from "./schema";

/**
 * The channel settings block.
 *
 * ## Only switches the app can honour
 *
 * `WISHLIST` and `ADMIN` render an in-app switch and *no* email switch — not a disabled
 * one, not a greyed one, none. The server refuses an `email` key for those categories
 * (`preferencesSchema` in `server/routes/notifications.ts`), so a control that looked
 * available would either be silently dropped or rejected; either way it teaches a user
 * that a setting works when it does nothing. `PREFERENCE_GROUPS` carries `hasEmail` and
 * this component simply does not render a second switch for those rows.
 *
 * ## The form is a diff, not a copy
 *
 * Edits are held as an *overlay* on the server's payload and written on "Save changes"
 * rather than on every toggle — each PATCH is a partial upsert and each write reconciles
 * the query cache, so a form that fired a request per switch would emit six requests and
 * six toasts to change one setting.
 *
 * Holding a diff rather than a snapshot of the payload is what makes a background refetch
 * harmless: the displayed value is `server-data` with `edits` layered on top, so a
 * refetch updates every switch the user has *not* touched and cannot discard one they
 * have. The previous implementation copied the payload into state and re-seeded it from
 * an effect, which needed a `dirty` guard to avoid clobbering a half-finished form —
 * and, with that guard, silently ignored a server change to every untouched group while
 * the user edited one. A derived diff has neither problem and no effect to synchronise.
 */

/** The channels this form has changed, keyed by group. Absent means "server's value". */
type ChannelEdits = Partial<Record<PreferenceKey, Partial<NotificationChannel>>>;

/** One channel with this form's pending edit applied, if there is one. */
function withEdits<T extends NotificationChannel>(base: T, edit?: Partial<NotificationChannel>): T {
  return edit ? { ...base, ...edit } : base;
}

export function NotificationPreferencesSection() {
  const { data, isLoading } = useNotificationPreferences(true);
  const save = useSaveNotificationPreferences();
  const [edits, setEdits] = useState<ChannelEdits>({});

  const dirty = Object.keys(edits).length > 0;

  const current: NotificationPreferences | undefined = data && {
    orders: withEdits(data.orders, edits.orders),
    rentals: withEdits(data.rentals, edits.rentals),
    payments: withEdits(data.payments, edits.payments),
    seller: withEdits(data.seller, edits.seller),
    wishlist: withEdits(data.wishlist, edits.wishlist),
    admin: withEdits(data.admin, edits.admin),
  };

  function toggle(key: PreferenceKey, channel: "inApp" | "email") {
    if (!current) return;
    const next = !current[key][channel];
    setEdits((previous) => ({ ...previous, [key]: { ...previous[key], [channel]: next } }));
  }

  async function handleSave() {
    if (!current) return;
    await save.mutateAsync({
      orders: current.orders,
      rentals: current.rentals,
      payments: current.payments,
      seller: current.seller,
      wishlist: { inApp: current.wishlist.inApp },
      admin: { inApp: current.admin.inApp },
    });
    setEdits({});
  }

  return (
    <Card id="notification-preferences" className="space-y-5 p-6">
      <div>
        <h2 className="section-title text-lg">Email &amp; alert preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what Revaro tells you about, and where. Changes apply to future alerts
          only — notifications already sent cannot be recalled.
        </p>
      </div>

      {isLoading || !current ? (
        <div className="space-y-3" aria-hidden>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {PREFERENCE_GROUPS.map((group) => {
            const channel = current[group.key];
            return (
              <li key={group.key} className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-sm font-extrabold">{group.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {group.description}
                  </p>
                </div>
                <Toggle
                  label={`In-app ${group.label.toLowerCase()} alerts`}
                  checked={channel.inApp}
                  onChange={() => toggle(group.key, "inApp")}
                />
                {group.hasEmail && (
                  <Toggle
                    label={`Email for ${group.label.toLowerCase()}`}
                    checked={channel.email ?? false}
                    onChange={() => toggle(group.key, "email")}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-4">
        {dirty && (
          <span className="text-xs font-semibold text-muted-foreground">
            Unsaved changes
          </span>
        )}
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => void handleSave()}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}

/**
 * One switch.
 *
 * A `<button role="switch">` rather than a styled checkbox, because the shape is the
 * affordance: the pill slides, and `aria-checked` is what a screen reader announces. A
 * checkbox announces "checked" in a form context that does not exist here.
 */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChange}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}