"use client";

import { domAnimation, LazyMotion, m } from "motion/react";
import type { ReactNode } from "react";

import { duration, fadeIn, gentleEase } from "@/lib/motion";

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className="min-h-svh w-full"
        initial="initial"
        animate="animate"
        variants={fadeIn}
        transition={{ duration: duration.normal, ease: gentleEase }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
