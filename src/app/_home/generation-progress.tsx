"use client";

import { CheckIcon, CircleIcon, Loader2Icon, MinusIcon, XIcon } from "lucide-react";
import type { AgentPhase, PhaseStatus } from "@/lib/ai/flow-agent-types";
import {
  AGENT_PROGRESS_PHASES,
  type AgentProgressPhaseState,
} from "@/lib/chat/agent-progress-message";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<AgentPhase, string> = {
  plan: "План сценария",
  structure: "Блоки на холсте",
  wiring: "Кнопки и ветки",
  content: "Тексты сообщений",
  validate: "Проверка",
  repair: "Исправление",
};

export type GenerationPhaseState = AgentProgressPhaseState;

export type GenerationProgressProps = {
  phases: GenerationPhaseState[];
  planSteps?: string[];
  nodeCount?: number;
  statusLabel?: string;
};

function PhaseIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case "active":
      return <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" />;
    case "done":
      return <CheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    case "error":
      return <XIcon className="size-3.5 shrink-0 text-destructive" />;
    case "skipped":
      return <MinusIcon className="size-3.5 shrink-0 text-muted-foreground" />;
    default:
      return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground/50" />;
  }
}

export function GenerationProgress({
  phases,
  planSteps = [],
  nodeCount = 0,
  statusLabel,
}: GenerationProgressProps) {
  const phaseMap = new Map(phases.map((item) => [item.phase, item]));

  return (
    <div className="space-y-3 text-sm">
      {statusLabel ? <p className="text-muted-foreground text-xs">{statusLabel}</p> : null}

      {planSteps.length > 0 ? (
        <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-2.5">
          <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
            Сценарий
          </p>
          <ul className="space-y-1">
            {planSteps.map((step) => (
              <li key={step} className="text-foreground/90 text-xs leading-relaxed">
                {step}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-1.5">
        {AGENT_PROGRESS_PHASES.map((phase) => {
          const state = phaseMap.get(phase) ?? { phase, status: "pending" as const };
          return (
            <li
              key={phase}
              className={cn(
                "flex items-center gap-2 rounded-md px-1 py-0.5",
                state.status === "active" && "bg-primary/5",
              )}
            >
              <PhaseIcon status={state.status} />
              <span
                className={cn(
                  "flex-1 text-xs",
                  state.status === "done" && "text-muted-foreground line-through",
                  state.status === "active" && "font-medium text-foreground",
                  state.status === "pending" && "text-muted-foreground",
                )}
              >
                {PHASE_LABELS[phase]}
                {state.detail ? ` — ${state.detail}` : ""}
              </span>
            </li>
          );
        })}
      </ul>

      {nodeCount > 0 ? (
        <p className="text-muted-foreground text-xs">Узлов на холсте: {nodeCount}</p>
      ) : null}
    </div>
  );
}
