import type { Transition, Variants } from "motion/react";

export const softSpring: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 28,
};

export const gentleSpring: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 24,
};

/** Для появления нод: пружинистый, но не слишком быстрый. */
export const nodeEnterSpring: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 28,
  mass: 0.8,
};

/** Быстрый захват при drag-старте. */
export const dragLiftSpring: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 32,
};

/** Плавное возвращение на место после drag. */
export const dragReleaseSpring: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 26,
};

export const gentleEase = [0.25, 0.1, 0.25, 1] as const;

export const duration = {
  fast: 0.18,
  normal: 0.28,
  slow: 0.7,
} as const;

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};
