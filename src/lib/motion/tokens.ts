export const motionDurations = {
  fast: 0.15,
  normal: 0.2,
  medium: 0.25,
  slow: 0.3,
  slower: 0.35,
} as const;

export const motionEasing = {
  out: [0.25, 0.1, 0.25, 1],
  inOut: [0.4, 0, 0.2, 1],
  in: [0.4, 0, 1, 1],
} as const;

export const motionDistances = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
} as const;
