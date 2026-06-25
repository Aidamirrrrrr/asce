import { flowAgentLog } from "@/lib/ai/flow-agent-log";
import type { FlowAgentMode } from "@/lib/ai/flow-agent-types";
import { db } from "@/lib/db";

export type FlowAgentTelemetry = {
  runId: string;
  recordStep: (input: {
    stepIndex: number;
    toolName: string;
    outcome: "ok" | "error" | "meta";
    errorText?: string;
    iterDurMs: number;
  }) => Promise<void>;
  finish: (input: {
    exitReason: string;
    totalSteps: number;
    nodeCountEnd: number;
    durationMs: number;
  }) => Promise<void>;
};

export async function createFlowAgentTelemetry(input: {
  projectId?: string;
  mode: FlowAgentMode;
  instruction: string;
  nodeCountStart: number;
}): Promise<FlowAgentTelemetry> {
  const run = await db.flowAgentRun.create({
    data: {
      projectId: input.projectId ?? null,
      mode: input.mode,
      instruction: input.instruction.slice(0, 800),
      exitReason: "in_progress",
      totalSteps: 0,
      nodeCountStart: input.nodeCountStart,
      nodeCountEnd: input.nodeCountStart,
      durationMs: 0,
    },
  });

  const startedAt = Date.now();

  return {
    runId: run.id,
    recordStep: async ({ stepIndex, toolName, outcome, errorText, iterDurMs }) => {
      await db.flowAgentStep
        .create({
          data: {
            runId: run.id,
            stepIndex,
            toolName,
            outcome,
            errorText: errorText?.slice(0, 300) ?? null,
            iterDurMs,
          },
        })
        .catch((error) => {
          flowAgentLog("telemetry step failed", {
            runId: run.id,
            message: error instanceof Error ? error.message : "unknown",
          });
        });
    },
    finish: async ({ exitReason, totalSteps, nodeCountEnd, durationMs }) => {
      await db.flowAgentRun
        .update({
          where: { id: run.id },
          data: {
            exitReason,
            totalSteps,
            nodeCountEnd,
            durationMs: durationMs > 0 ? durationMs : Date.now() - startedAt,
          },
        })
        .catch((error) => {
          flowAgentLog("telemetry finish failed", {
            runId: run.id,
            message: error instanceof Error ? error.message : "unknown",
          });
        });
    },
  };
}
