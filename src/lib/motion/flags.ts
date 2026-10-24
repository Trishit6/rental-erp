/**
 * Kill switches for the twelve signature motion effects (U4).
 *
 * The R13 flag system (`server/lib/flags.ts`) evaluates server-side and has no
 * client surface yet, so the U4 spec's fallback applies: the effects read the
 * same keys from this constants file until a public flag surface exists. Every
 * key defaults to **on** — a disable must be a deliberate act.
 *
 * Turning a key off is not a security boundary (see the R13 warning): it hides
 * a decorative effect. Each flag leaves the underlying data section intact —
 * e.g. `fx.reviewShuffle` off hides the shuffle animation and renders the
 * featured reviews as a plain list, because the data endpoint is allowed to
 * exist on its own.
 */
export const FX_FLAGS = {
  "fx.heroReveal": true,
  "fx.wordRotator": true,
  "fx.salePings": true,
  "fx.reviewShuffle": true,
  "fx.countUpStats": true,
  "fx.bentoBuild": true,
  "fx.cursorTour": true,
  "fx.processDraw": true,
  "fx.beforeAfter": true,
  "fx.priceRoll": true,
  "fx.usVsThem": true,
  "fx.successButton": true,
} as const satisfies Record<string, boolean>;

export type FxFlagKey = keyof typeof FX_FLAGS;

export function isFxEnabled(key: FxFlagKey): boolean {
  return FX_FLAGS[key];
}
