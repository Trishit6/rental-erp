import { motion } from "framer-motion";
import { Check, Bell, Mail } from "lucide-react";
import type { NotificationCategory } from "../types";

/** One channel pill. The native checkbox is visually hidden and the label wraps
 * the pill, so the checkbox is the only thing that actually receives keyboard
 * focus and toggles. `data-state="on"|"off"` drives the pill styling, and the
 * visible check icon is a Framer Motion scale-in (transform + opacity only,
 * 120ms, reduced-motion respected).
 *
 * The pill is a 44px-tall, 96px-wide minimum box that never collapses: on
 * narrow viewports the label's flex-1 fills the remaining space, so two pills
 * in a row are a minimum of 48% each and a single pill is full width.
 */
export interface PreferencePillProps {
  /** "Orders & purchases" etc. Used for the accessible name:
   * "Orders & purchases: In-app". */
  category: NotificationCategory;
  channel: "inApp" | "email";
  checked: boolean;
  disabled?: boolean;
  locked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function PreferencePill({
  category,
  channel,
  checked,
  disabled,
  locked,
  onCheckedChange,
}: PreferencePillProps) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion)").matches;
  const Icon = channel === "inApp" ? Bell : Mail;

  return (
    <label
      className="flex min-w-0 flex-1 flex-col gap-1 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
      title={`${category}: ${channel === "inApp" ? "In-app" : "Email"}`}
    >
      <input
        type="checkbox"
        role="switch"
        aria-label={`${category}: ${channel === "inApp" ? "In-app" : "Email"}`}
        checked={checked}
        disabled={disabled || locked}
        onChange={(e) => {
          if (!e.target.disabled) {
            onCheckedChange?.(e.target.checked);
          }
        }}
        className="peer sr-only h-6 w-11 shrink-0 rounded-full border border-border bg-[var(--inset-bg)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
      />
      <span
        data-state={checked ? "on" : "off"}
        className={`flex min-h-[44px] min-w-[96px] flex-row-items-center justify-between gap-2 px-3.5 rounded-xl border text-sm font-semibold transition-colors duration-150 focus-within:outline-none focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-background peer-disabled:opacity-50`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon size={15} aria-hidden />
          <span className="truncate text-foreground">{category}</span>
        </span>
        <span className="flex shrink-0 items-center justify-end">
          {checked && (
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="flex h-4 w-4 items-center justify-center"
            >
              <Check size={13} aria-hidden />
            </motion.span>
          )}
        </span>
      </span>
    </label>
  );
}
