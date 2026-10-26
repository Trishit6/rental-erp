import { motionDurations, motionEasing } from "./tokens";

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 12 },
};

export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

export function slideIn(direction: "left" | "right" | "up" | "down" = "up") {
  const map = {
    up: { y: 12 },
    down: { y: -12 },
    left: { x: 12 },
    right: { x: -12 },
  } as const;
  const d = map[direction];
  return {
    initial: { opacity: 0, ...d },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, ...d },
  };
}

export function stagger(parentDelay = 0.05) {
  return {
    animate: {
      transition: {
        staggerChildren: parentDelay,
      },
    },
  };
}

export const reducedMotionSafe = (prefersReducedMotion: boolean | null) => {
  if (prefersReducedMotion) {
    return {
      initial: false,
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    } as const;
  }
  return null;
};

export const transitions = {
  fast: { duration: motionDurations.fast, ease: motionEasing.out },
  normal: { duration: motionDurations.normal, ease: motionEasing.out },
};
