export const KNOWN_FLAGS = [
  "new.checkout",
  "seller.onboarding.v2",
  "catalogue.recommendations",
] as const;

export type KnownFlag = (typeof KNOWN_FLAGS)[number];
