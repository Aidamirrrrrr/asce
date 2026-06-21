"use client";

import { AnimatePresence, domAnimation, LazyMotion, m } from "motion/react";
import type { ReactNode } from "react";

import { duration, gentleEase } from "@/lib/motion";

type AnimatedStatusBadgeProps = {
  show: boolean;
  badgeKey: string;
  children: ReactNode;
};

export function AnimatedStatusBadge({ show, badgeKey, children }: AnimatedStatusBadgeProps) {
  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false} mode="popLayout">
        {show ? (
          <m.div
            key={badgeKey}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: duration.normal, ease: gentleEase }}
          >
            {children}
          </m.div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}
