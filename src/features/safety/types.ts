/**
 * Account-blocking types. Mirrors `server/lib/blocks.ts`.
 *
 * The server returns the blocker's own list only — there is no endpoint that
 * answers "who blocked me", because that is the fact a block exists to keep from
 * the other party.
 */
export type BlockedUser = {
  id: number;
  name: string;
  avatarUrl: string | null;
  /** The blocker's private note. Never shown to the blocked account. */
  reason: string | null;
  /** ISO timestamp of when the block was placed. */
  blockedAt: string;
};

/**
 * What a report is about (PROMPT 18).
 *
 * The six kinds mirror the six nullable target columns on `reports`; `server/lib/reports.ts`
 * refuses a report that names none of them and one that names more than one. The client
 * keeps the same closed set so a caller cannot invent a target the server would reject.
 */
export type ReportTargetKind = "product" | "user" | "review" | "message" | "order" | "rental";

export type ReportTarget = {
  kind: ReportTargetKind;
  id: number;
  /** A short noun for the dialog copy ("this listing", "this message"). Optional. */
  label?: string;
};
