/** Placeholder matching the payment layout's shape, so the page does not jump. */
export function PaymentSkeleton() {
  return (
    <div className="page-wrap max-w-4xl space-y-5 pt-8" data-testid="payment-skeleton">
      <div className="raised-surface h-9 w-52 animate-pulse rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-3">
          <div className="raised-surface h-[68px] animate-pulse rounded-2xl" />
          <div className="raised-surface h-[68px] animate-pulse rounded-2xl" />
          <div className="raised-surface h-[68px] animate-pulse rounded-2xl" />
        </div>
        <div className="raised-surface h-72 animate-pulse rounded-3xl" />
      </div>
    </div>
  );
}
