"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TranscriptStep } from "@/lib/flow/simulate-flow";
import { cn } from "@/lib/utils";

type DialogPreviewProps = {
  steps: TranscriptStep[];
  className?: string;
  defaultExpanded?: boolean;
  compact?: boolean;
};

export function DialogPreview({
  steps,
  className,
  defaultExpanded = false,
  compact = false,
}: DialogPreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (steps.length === 0) {
    return null;
  }

  const preview = compact && !expanded ? steps.slice(0, 4) : steps;

  return (
    <div className={cn("rounded-md border border-border/60 bg-muted/20", className)}>
      <div className="flex items-center justify-between gap-2 border-border/60 border-b px-3 py-2">
        <p className="font-medium text-muted-foreground text-xs">Как увидит пользователь</p>
        {steps.length > 4 || compact ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Свернуть" : "Показать всё"}
          </Button>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        {preview.map((step, index) => (
          <div key={`${step.nodeId}-${index}`} className="flex gap-2">
            <div className="mt-0.5 size-6 shrink-0 rounded-full bg-primary/10 text-center text-[10px] leading-6 text-primary">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {step.label}
              </p>
              <p className="text-foreground/90 text-xs leading-relaxed whitespace-pre-wrap">
                {step.text}
              </p>
            </div>
          </div>
        ))}
        {!expanded && steps.length > preview.length ? (
          <p className="text-muted-foreground text-xs">
            …ещё {steps.length - preview.length} шагов
          </p>
        ) : null}
      </div>
    </div>
  );
}
