import { Lock, Mail } from "lucide-react";
import { PreferencePill } from "./PreferencePill";
import type { NotificationCategory, PreferenceKey } from "../types";
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS } from "./schema";

/** One grouped category card row.
 *
 * - `locked: true` → the In-app pill is forced on, disabled, with a lock icon
 *   and a small "Always on for your safety" note; the server enforces the same.
 * - A channel the server does not honour for the category → the pill is disabled
 *   with "Coming soon" as its text. Never a working-looking control that does
 *   nothing.
 * - `accessibilityOnly` → role=user (not seller) or has no listings: the whole
 *   Selling group is omitted; `staffOnly` → role=staff only.
 */
export interface CategoryCardProps {
  category: NotificationCategory;
  key: PreferenceKey;
  locked: boolean;
  /** The server's capability answer for this category, returned by the API. */
  available: boolean;
  /** Whether the category offers an email channel. */
  hasEmail: boolean;
  /** Whether the email transport exists at all on the server. */
  emailTransportAvailable: boolean;
  userRole: "USER" | "SELLER" | "STAFF";
  hasSellerListings: boolean;
  hasStaffPermission: boolean;
  /** The current effective channel values for this category. */
  current: { inApp: boolean; email?: boolean };
  onToggle: (key: PreferenceKey, channel: "inApp" | "email") => void;
}

function lockedNote() {
  return (
    <span className="text-[10px] font-semibold text-muted-foreground">
      Always on for your safety
    </span>
  );
}

export function CategoryCard({
  category,
  key,
  locked,
  available,
  hasEmail,
  emailTransportAvailable,
  userRole,
  hasSellerListings,
  hasStaffPermission,
  current,
  onToggle,
}: CategoryCardProps) {
  if (key === "seller" && !(userRole === "SELLER" || hasSellerListings)) return null;
  if (key === "admin" && !hasStaffPermission) return null;

  const isEmailCapable = hasEmail && emailTransportAvailable;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-[var(--inset-bg)] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-base font-extrabold text-foreground">
          {CATEGORY_LABELS[category]}
        </h3>
        {locked && (
          <Lock size={15} aria-hidden className="text-primary-shade" />
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {CATEGORY_DESCRIPTIONS[category]}
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          {/* In-app pill */}
          <PreferencePill
            category={category}
            channel="inApp"
            checked={current.inApp}
            disabled={locked || !available}
            locked={locked}
            onCheckedChange={(_v) => onToggle(key, "inApp")}
          />
          {/* Email pill, when the category honours it */}
          {isEmailCapable ? (
            <PreferencePill
              category={category}
              channel="email"
              checked={current.email ?? false}
              disabled={!available}
              onCheckedChange={(_v) => onToggle(key, "email")}
            />
          ) : !available ? (
            /* Unavailable (server does not honour this channel): disabled pill with
               "Coming soon" text, never a working-looking control that does nothing. */
            <span
              className="flex min-h-[44px] min-w-[96px] flex-row-items-center justify-between gap-2 rounded-xl border border-border bg-[var(--inset-bg)] px-3.5 text-xs font-semibold text-muted-foreground"
              data-state="off"
            >
              <span className="flex items-center gap-2.5">
                <Mail size={15} aria-hidden />
                <span className="truncate">Coming soon</span>
              </span>
            </span>
          ) : (
            /* Email transport missing entirely: note, no pill. */
            <span className="text-xs font-semibold text-muted-foreground">
              Email delivery is not set up yet
            </span>
          )}
        </div>
        {locked && <span className="text-[10px] font-semibold text-muted-foreground">{lockedNote()}</span>}
      </div>
    </div>
  );
}
