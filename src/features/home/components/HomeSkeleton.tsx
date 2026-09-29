/**
 * Layout-matched skeleton for the home page — no generic full-page spinner.
 * Mirrors: hero, categories, featured, rental, pre-loved, seller CTA.
 */
export function HomeSkeleton() {
  return (
    <div
      className="page-wrap space-y-9 pb-2 pt-7 sm:pt-10"
      aria-busy="true"
      aria-label="Loading home"
    >
      {/* Hero */}
      <div className="raised-surface grid gap-7 rounded-[32px] p-5 sm:p-8 lg:grid-cols-[1.08fr_.92fr] lg:p-10">
        <div className="space-y-4 py-2">
          <div className="inset-surface h-8 w-56 rounded-full" />
          <div className="inset-surface h-12 w-full max-w-xl rounded-2xl" />
          <div className="inset-surface h-12 w-3/4 max-w-md rounded-2xl" />
          <div className="inset-surface h-4 w-full max-w-lg rounded-full" />
          <div className="inset-surface h-4 w-2/3 max-w-sm rounded-full" />
          <div className="flex gap-3 pt-2">
            <div className="inset-surface h-12 w-40 rounded-full" />
            <div className="inset-surface h-12 w-36 rounded-full" />
          </div>
        </div>
        <div className="inset-surface aspect-[4/3] rounded-[28px]" />
      </div>

      {/* Categories */}
      <div className="space-y-4">
        <div className="inset-surface h-6 w-48 rounded-full" />
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="inset-surface flex h-[104px] w-[118px] flex-col items-center justify-center gap-3 rounded-2xl"
            >
              <div className="inset-surface size-11 rounded-full" />
              <div className="inset-surface h-3 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Product sections x2 */}
      {[0, 1].map((section) => (
        <div key={section} className="space-y-5">
          <div className="flex items-end justify-between">
            <div className="space-y-2">
              <div className="inset-surface h-4 w-32 rounded-full" />
              <div className="inset-surface h-7 w-56 rounded-full" />
            </div>
            <div className="inset-surface h-10 w-28 rounded-full" />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="raised-surface space-y-3 rounded-3xl p-3.5">
                <div className="inset-surface aspect-[4/3] rounded-2xl" />
                <div className="inset-surface h-4 w-3/4 rounded-full" />
                <div className="inset-surface h-4 w-1/2 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Seller CTA */}
      <div className="raised-surface flex items-center justify-between gap-4 rounded-3xl px-6 py-6 sm:px-8">
        <div className="space-y-2">
          <div className="inset-surface h-5 w-64 rounded-full" />
          <div className="inset-surface h-4 w-80 rounded-full" />
        </div>
        <div className="inset-surface h-12 w-36 rounded-full" />
      </div>
    </div>
  );
}
