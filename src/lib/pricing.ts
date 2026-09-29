/**
 * Money helpers. All amounts are integer minor units (paise).
 * Never do money math with floats.
 */

export const PAISE_PER_RUPEE = 100;

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

export function paiseToRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

export function formatInr(paise: number): string {
  const rupees = paise / PAISE_PER_RUPEE;
  const formatted = rupees.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
  return `₹${formatted}`;
}

export function formatInrRental(paise: number): string {
  return `${formatInr(paise)}/day`;
}

/* ------------------------------ rental math ------------------------------- */

export type RentalDaysInput = {
  startDate: string | Date;
  endDate: string | Date;
};

export function rentalDays({ startDate, endDate }: RentalDaysInput): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const days = Math.ceil((end - start) / (24 * 60 * 60 * 1000));
  return Math.max(1, days);
}

/**
 * Truncate an instant to a UTC day boundary.
 *
 * Rental dates are stored day-precision (`timestamp(..., { mode: "date" })`), so
 * every "how many days left" question has to be answered on day boundaries.
 * Doing it in UTC rather than local time is what keeps a rental from shifting a
 * day for viewers east or west of Greenwich — and it behaves identically on the
 * server and in the browser, which is why it lives in this shared file.
 */
export function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * Whole days from `from` to `to`, on UTC day boundaries, never negative.
 *
 * A rental that ends today has zero days left, not a fraction of one. Invalid
 * input returns 0 rather than NaN, so a missing date renders as "due" instead of
 * putting NaN in the DOM.
 */
export function rentalDaysUntil(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Has a rental's window opened? */
export function hasRentalStarted(startDate: Date, now: Date = new Date()): boolean {
  return startOfDay(startDate).getTime() <= startOfDay(now).getTime();
}

/** Has a rental's window closed? Strictly before today — ending today is not late. */
export function hasRentalEnded(endDate: Date, now: Date = new Date()): boolean {
  return startOfDay(endDate).getTime() < startOfDay(now).getTime();
}

/** Add whole days to a day-precision date, in UTC so DST cannot shift it. */
export function addDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + Math.trunc(days));
  return next;
}

export type RentalProduct = {
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
};

export type RentalQuote = {
  days: number;
  dailyRate: number;
  rentalSubtotal: number;
  securityDeposit: number;
  total: number;
};

/**
 * Effective daily rate: use day rate, but week/month tiers can be cheaper.
 */
export function effectiveDailyRate(product: RentalProduct, days: number): number {
  const day = product.rentalPricePerDay ?? 0;
  if (days >= 30 && product.rentalPricePerMonth) {
    return Math.min(day, Math.ceil(product.rentalPricePerMonth / 30));
  }
  if (days >= 7 && product.rentalPricePerWeek) {
    return Math.min(day, Math.ceil(product.rentalPricePerWeek / 7));
  }
  return day;
}

export function quoteRental(
  product: RentalProduct,
  { startDate, endDate }: RentalDaysInput,
  deliveryFee = 0,
): RentalQuote {
  const days = rentalDays({ startDate, endDate });
  const dailyRate = effectiveDailyRate(product, days);
  const rentalSubtotal = dailyRate * days;
  const securityDeposit = product.securityDeposit ?? 0;
  const total = rentalSubtotal + deliveryFee + securityDeposit;
  return { days, dailyRate, rentalSubtotal, securityDeposit, total };
}

export function quotePurchase(
  purchasePrice: number,
  quantity: number,
  deliveryFee = 0,
): { subtotal: number; total: number } {
  const subtotal = purchasePrice * quantity;
  return { subtotal, total: subtotal + deliveryFee };
}

export function platformFee(amount: number, feePercent: number): number {
  return Math.round((amount * feePercent) / 100);
}

export function isOverlapping(
  aStart: string | Date,
  aEnd: string | Date,
  bStart: string | Date,
  bEnd: string | Date,
): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function uniqueSlug(text: string): string {
  const base = slugify(text) || "item";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
