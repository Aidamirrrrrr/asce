import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Пульсирующий бета-бейдж (единый стиль для лендинга и кабинета). */
export function BetaBadge({
  children = "Бета",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary text-xs ring-1 ring-primary/20",
        className,
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      {children}
    </span>
  );
}
