import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Фирменный градиентный акцент asce (primary → sky). */
export function GradientText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "bg-gradient-to-r from-primary to-sky-500 bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}
