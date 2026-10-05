import { formatInr } from "@/lib/pricing";

/**
 * Shared formatting for the admin workspace tables.
 *
 * ## Why these live here rather than in the page that first needed them
 *
 * Money and dates appeared in `AdminOrdersPage` first, then in the rentals, users,
 * sellers, transactions, finance and reviews tables. Each copy was a function of
 * fifteen lines whose only job was to be *identical*, and identical copies are how a
 * table ends up showing a paise amount with no symbol while the row above it shows
 * the same amount in rupees. One definition, imported by every section, cannot drift.
 *
 * The rule they encode is the app's existing one: paise on the wire, converted in
 * `lib/pricing` and nowhere else.
 */

/**
 * An amount, in the currency the record was written in.
 *
 * `formatInr` covers INR, which is every record this marketplace can currently
 * create; the branch exists so that the day a second currency appears the table says
 * which one rather than silently mislabelling the amount — a wrong currency symbol on
 * a revenue column is worse than a raw number.
 */
export function formatAdminMoney(paise: number, currency = "INR"): string {
  return currency === "INR" ? formatInr(paise) : `${currency} ${(paise / 100).toFixed(2)}`;
}

/** A date, matching the catalogue's `day month year` treatment. */
export function formatAdminDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** A date and time — for the audit log, where order matters more than calendar day. */
export function formatAdminDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatAdminDate(date)}, ${date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * `SUSPENDED_ORDERS` → `Suspended orders`.
 *
 * Every enum in this workspace arrives from the database as screaming snake case, and
 * the alternative — each table hand-writing its own labels — is what produced a
 * `CANCELLED` badge reading "Cancelled" next to one reading "canceled" three columns
 * away.
 */
export function humanizeEnum(value: string): string {
  const spaced = value.replace(/[_-]/g, " ").trim().toLowerCase();
  if (!spaced) return "—";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Whole numbers with the app's Indian digit grouping (1,23,456). */
export function formatAdminCount(value: number | string | null | undefined): string {
  const amount = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("en-IN").format(Number.isFinite(amount) ? amount : 0);
}
