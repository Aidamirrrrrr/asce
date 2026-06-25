import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { runChatToolStep } from "@/lib/ai/ai-client";
import { flowAgentLog, flowAgentWarn } from "@/lib/ai/flow-agent-log";
import type { FlowAgentTelemetry } from "@/lib/ai/flow-agent-telemetry";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { applyFlowTool } from "@/lib/flow/flow-tools";
import { applyLayoutToFlowDocument } from "@/lib/flow/normalize-generated-flow";

export type ToolPhaseResult = {
  doc: BotFlowDocument;
  stepsUsed: number;
  stepLimitReached: boolean;
  docChanged: boolean;
};

export async function runAgentToolPhase(input: {
  systemPrompt: string;
  userMessage: string;
  tools: ChatCompletionTool[];
  doc: BotFlowDocument;
  maxSteps: number;
  globalStepOffset?: number;
  telemetry?: FlowAgentTelemetry;
  onDocChange?: (doc: BotFlowDocument) => void;
}): Promise<ToolPhaseResult> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: input.userMessage },
  ];

  let current = input.doc;
  let stepsUsed = 0;
  let docChanged = false;
  let stepLimitReached = false;

  for (let i = 0; i < input.maxSteps; i++) {
    const iterStartedAt = Date.now();
    const response = await runChatToolStep(messages, input.tools);
    if (!response) {
      break;
    }

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      break;
    }

    messages.push({
      role: "assistant",
      content: response.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const fnCall = (call as { id: string; function: { name: string; arguments: string } })
        .function;
      const name = fnCall.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(fnCall.arguments) as Record<string, unknown>;
      } catch {
        const errorText = "невалидный JSON аргументов";
        await input.telemetry?.recordStep({
          stepIndex: (input.globalStepOffset ?? 0) + stepsUsed,
          toolName: name,
          outcome: "error",
          errorText,
          iterDurMs: Date.now() - iterStartedAt,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Ошибка: ${errorText}`,
        });
        continue;
      }

      const result = applyFlowTool(current, name, args);
      if (result.ok) {
        current = result.doc;
        docChanged = true;
        input.onDocChange?.(current);
        flowAgentLog("agent tool ok", { tool: name, step: stepsUsed + 1 });
        await input.telemetry?.recordStep({
          stepIndex: (input.globalStepOffset ?? 0) + stepsUsed,
          toolName: name,
          outcome: "ok",
          iterDurMs: Date.now() - iterStartedAt,
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: result.summary });
      } else {
        flowAgentWarn("agent tool error", { tool: name, error: result.error });
        await input.telemetry?.recordStep({
          stepIndex: (input.globalStepOffset ?? 0) + stepsUsed,
          toolName: name,
          outcome: "error",
          errorText: result.error,
          iterDurMs: Date.now() - iterStartedAt,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Ошибка: ${result.error}`,
        });
      }

      stepsUsed += 1;
      if (stepsUsed >= input.maxSteps) {
        stepLimitReached = true;
        break;
      }
    }

    if (stepLimitReached) {
      break;
    }
  }

  if (docChanged) {
    current = applyLayoutToFlowDocument(current);
    input.onDocChange?.(current);
  }

  return { doc: current, stepsUsed, stepLimitReached, docChanged };
}
