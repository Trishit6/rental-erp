import { useCallback, useMemo } from "react";
import type { PreferenceKey } from "../types";
import type { NotificationPreferences } from "../types";
import { PREFERENCE_KEYS_IN_ORDER } from "./schema";

/** One channel status card in the status strip. */
export interface ChannelStatusStripProps {
  current: NotificationPreferences;
  locked: string[];
  emailTransportAvailable: boolean;
  /** Toggle every unlocked category for the given channel. */
  onAllToggle: (channel: "inApp" | "email") => void;
}

/**
 * Channel status strip: two small cards, "In-app: On" and "Email: On for X of Y",
 * each with an "All on / All off" text button that toggles that channel for
 * every unlocked category.
 *
 * The count on the Email card is what tells a user "you said email is on, but
 * you only have it on for four of the six categories". An All-off button on
 * that card turns every unlocked category email off.
 */
export function ChannelStatusStrip({
  current,
  locked,
  emailTransportAvailable,
  onAllToggle,
}: ChannelStatusStripProps) {
  const unlocked = useMemo(() => {
    if (!current) return [] as PreferenceKey[];
    return PREFERENCE_KEYS_IN_ORDER.filter((key) => {
      if (locked.includes(key)) return false;
      const entry = current[key];
      return entry != null;
    });
  }, [current, locked]);

  const emailOnCount = useMemo(() => {
    return unlocked.filter((key) => current[key]?.email !== false).length;
  }, [unlocked, current]);

  const canToggleEmail = emailTransportAvailable && unlocked.some(
    (key) => current[key]?.email !== false,
  );

  const handleAllToggle = useCallback(
    (channel: "inApp" | "email") => {
      onAllToggle(channel);
    },
    [onAllToggle],
  );

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border border-border bg-[var(--inset-bg)] p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
            <span className="text-sm font-bold text-foreground">
              In-app:
              <span className="ml-1.5 font-normal">
                {unlocked.length === 0
                  ? "No categories to control"
                  : current && current["orders"]
                    ? "On"
                    : "Off"}
              </span>
            </span>
          </div>
          <button
            type="button"
            className="soft-button! h-8 px-3 text-xs font-bold text-foreground hover:text-primary shrink-0"
            onClick={() => handleAllToggle("inApp")}
            aria-label="Toggle in-app for all unlocked categories"
          >
            All on / All off
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Controls every category that is not locked.
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border border-border bg-[var(--inset-bg)] p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
            <span className="text-sm font-bold text-foreground">
              Email:
              <span className="ml-1.5 font-normal">
                {emailTransportAvailable
                  ? `On for ${emailOnCount} of ${unlocked.length}`
                  : "Not set up yet"}
              </span>
            </span>
          </div>
          <button
            type="button"
            className="soft-button! h-8 px-3 text-xs font-bold text-foreground hover:text-primary shrink-0"
            onClick={() => handleAllToggle("email")}
            disabled={!canToggleEmail}
            aria-label={
              canToggleEmail
                ? "Toggle email for all unlocked categories"
                : "Email delivery is not set up yet"
            }
          >
            All on / All off
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {emailTransportAvailable
            ? "Turns email on for every unlocked category."
            : "Email delivery is not set up yet."}
        </p>
      </div>
    </div>
  );
}
