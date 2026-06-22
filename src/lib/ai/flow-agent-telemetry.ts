import { db } from "@/lib/db";

export type TelemetryStep = {
  stepIndex: number;
  toolName: string;
  outcome: "ok" | "error" | "meta";
  errorText?: string;
  iterDurMs: number;
};

export type TelemetryRunData = {
  projectId?: string;
  mode: "create" | "refine";
  instruction: string;
  exitReason: string;
  totalSteps: number;
  nodeCountStart: number;
  nodeCountEnd: number;
  durationMs: number;
};

/** Fire-and-forget: сохраняем один запуск + все его шаги в БД. Не бросает исключений. */
export function saveFlowAgentRun(run: TelemetryRunData, steps: TelemetryStep[]): void {
  void (async () => {
    try {
      const created = await db.flowAgentRun.create({
        data: {
          projectId: run.projectId ?? null,
          mode: run.mode,
          instruction: run.instruction.slice(0, 800),
          exitReason: run.exitReason,
          totalSteps: run.totalSteps,
          nodeCountStart: run.nodeCountStart,
          nodeCountEnd: run.nodeCountEnd,
          durationMs: run.durationMs,
        },
      });

      if (steps.length > 0) {
        await db.flowAgentStep.createMany({
          data: steps.map((s) => ({
            runId: created.id,
            stepIndex: s.stepIndex,
            toolName: s.toolName,
            outcome: s.outcome,
            errorText: s.errorText ?? null,
            iterDurMs: s.iterDurMs,
          })),
        });
      }
    } catch {
      // телеметрия не должна ломать основной флоу
    }
  })();
}
