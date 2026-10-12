/**
 * Date helpers for the support surfaces.
 *
 * Kept local to the feature rather than reaching into `messages/components/schema.ts`:
 * the two features share a *style* of relative time, not a contract, and an import
 * across features would couple the ticket list to the messaging internals.
 */

/** A short "how long ago" for a list row. Degrades to an absolute date past a week. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min ago";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;

  const hours = Math.round(seconds / 3600);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d ago`;

  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** The full timestamp shown on a message, so a thread has an unambiguous record. */
export function fullTimestamp(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  return then.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
