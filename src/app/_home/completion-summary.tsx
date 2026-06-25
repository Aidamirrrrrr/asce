"use client";

import { useState } from "react";
import { DialogPreview } from "@/app/_home/dialog-preview";
import { Button } from "@/components/ui/button";
import type { TranscriptStep } from "@/lib/flow/simulate-flow";
import { cn } from "@/lib/utils";

type CompletionSummaryProps = {
  validationSummary?: string | null;
  dialogPreview?: TranscriptStep[];
  stepLimitReached?: boolean;
  onContinue?: () => void;
  isContinueDisabled?: boolean;
  className?: string;
};

export function CompletionSummary({
  validationSummary,
  dialogPreview,
  stepLimitReached,
  onContinue,
  isContinueDisabled,
  className,
}: CompletionSummaryProps) {
  const [showPreview, setShowPreview] = useState(false);
  const hasWarnings = Boolean(validationSummary?.trim());
  const hasPreview = Boolean(dialogPreview && dialogPreview.length > 0);

  if (!(hasWarnings || hasPreview || stepLimitReached)) {
    return null;
  }

  return (
    <div className={cn("mt-3 space-y-2", className)}>
      {stepLimitReached ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-900 text-xs dark:text-amber-100">
          <p>Схема собрана частично — можно продолжить сборку.</p>
          {onContinue ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-7"
              disabled={isContinueDisabled}
              onClick={onContinue}
            >
              Продолжить сборку
            </Button>
          ) : null}
        </div>
      ) : null}

      {hasWarnings ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          <p className="mb-1 font-medium text-amber-800 dark:text-amber-200">Замечания</p>
          <pre className="whitespace-pre-wrap text-foreground/80 font-sans">
            {validationSummary}
          </pre>
        </div>
      ) : null}

      {hasPreview ? (
        !showPreview ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowPreview(true)}
          >
            Открыть превью диалога
          </Button>
        ) : (
          <DialogPreview steps={dialogPreview ?? []} defaultExpanded />
        )
      ) : null}
    </div>
  );
}
