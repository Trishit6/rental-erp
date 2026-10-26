import { eq } from "drizzle-orm";
import { db } from "../db";
import { platformSettings } from "../schema";

/**
 * The cancellation policy, and the refund it produces.
 *
 * ## Policy lives in the database, not in the code
 *
 * Whether a customer gets their money back for cancelling is a commercial
 * decision, not an engineering one, and it changes without a deploy. The policy
 * is therefore a single JSON document under `platform_settings`, read through
 * this module, which is the only thing that knows its shape. A missing or
 * malformed document falls back to the documented defaults rather than throwing
 * — a cancellation must not become impossible because an admin saved a bad
 * value.
 *
 * ## The arithmetic is pure
 *
 * `computeCancellationRefund` takes the policy and the rental and returns the
 * parts. It reads no clock (the caller passes `now`), touches no database and
 * makes no provider call, so the boundary cases — before the window, after it, a
 * deposit with nothing to refund — are tested directly.
 */

export const RENTAL_CANCELLATION_SETTING_KEY = "rental.cancellation";

export type RentalCancellationPolicy = {
  /** Refund the whole rental charge when the booking has not started yet. */
  fullRefundBeforeStart: boolean;
  /** The refundable deposit is always returned, whatever the rent policy says. */
  depositAlwaysRefunded: boolean;
  /**
   * How much of the rental charge comes back once the window has opened,
   * as a percentage (0–100). `0` is the default: a started rental is not
   * normally refundable.
   */
  afterStartRentalRefundPercent: number;
};

export const DEFAULT_RENTAL_CANCELLATION_POLICY: RentalCancellationPolicy = {
  fullRefundBeforeStart: true,
  depositAlwaysRefunded: true,
  afterStartRentalRefundPercent: 0,
};

function clampPercent(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

/**
 * Read a policy from whatever is stored. Anything unreadable becomes the
 * default; fields that are present but the wrong type are ignored individually,
 * so one bad key cannot discard the whole document.
 */
export function parseRentalCancellationPolicy(value: unknown): RentalCancellationPolicy {
  let document: unknown = value;
  if (typeof document === "string") {
    try {
      document = JSON.parse(document);
    } catch {
      return { ...DEFAULT_RENTAL_CANCELLATION_POLICY };
    }
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return { ...DEFAULT_RENTAL_CANCELLATION_POLICY };
  }

  const raw = document as Record<string, unknown>;
  return {
    fullRefundBeforeStart:
      typeof raw.fullRefundBeforeStart === "boolean"
        ? raw.fullRefundBeforeStart
        : DEFAULT_RENTAL_CANCELLATION_POLICY.fullRefundBeforeStart,
    depositAlwaysRefunded:
      typeof raw.depositAlwaysRefunded === "boolean"
        ? raw.depositAlwaysRefunded
        : DEFAULT_RENTAL_CANCELLATION_POLICY.depositAlwaysRefunded,
    afterStartRentalRefundPercent:
      raw.afterStartRentalRefundPercent === undefined
        ? DEFAULT_RENTAL_CANCELLATION_POLICY.afterStartRentalRefundPercent
        : clampPercent(raw.afterStartRentalRefundPercent),
  };
}

/** The configured policy, or the defaults when nothing is stored. */
export async function readRentalCancellationPolicy(
  executor: Pick<typeof db, "select"> = db,
): Promise<RentalCancellationPolicy> {
  const [row] = await executor
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, RENTAL_CANCELLATION_SETTING_KEY))
    .limit(1);
  return parseRentalCancellationPolicy(row?.value);
}

export type CancellationRefund = {
  /** True when the booking had not started, which is what most of the policy keys off. */
  beforeStart: boolean;
  /** The rent part of the refund, in paise. */
  rentalRefund: number;
  /** The deposit part of the refund, in paise. */
  depositRefund: number;
  /** `rentalRefund + depositRefund`, capped by what is actually refundable. */
  total: number;
};

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * Work out what a cancellation owes back.
 *
 * `captured` is what actually settled and `alreadyRefunded` what has already been
 * returned; the result can never exceed their difference, so a second
 * cancellation or a generous policy cannot refund money the platform never took.
 */
export function computeCancellationRefund(input: {
  policy: RentalCancellationPolicy;
  rental: { rentalSubtotal: number; securityDeposit: number; startDate: Date };
  /** What settled for this rental's order, in paise. */
  captured: number;
  /** Live refunds already against this order, in paise. */
  alreadyRefunded?: number;
  now?: Date;
}): CancellationRefund {
  const now = input.now ?? new Date();
  const beforeStart = startOfUtcDay(now) < startOfUtcDay(input.rental.startDate);

  const rentalRefund = beforeStart
    ? input.policy.fullRefundBeforeStart
      ? Math.max(0, input.rental.rentalSubtotal)
      : 0
    : Math.round(
        (Math.max(0, input.rental.rentalSubtotal) *
          input.policy.afterStartRentalRefundPercent) /
          100,
      );

  const depositRefund = input.policy.depositAlwaysRefunded
    ? Math.max(0, input.rental.securityDeposit)
    : 0;

  const ceiling = Math.max(0, input.captured - (input.alreadyRefunded ?? 0));
  const total = Math.min(rentalRefund + depositRefund, ceiling);

  return { beforeStart, rentalRefund, depositRefund, total: Math.max(0, total) };
}
