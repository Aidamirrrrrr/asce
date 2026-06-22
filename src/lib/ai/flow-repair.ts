/**
 * Short structural repair loop.
 * Only connect_nodes and delete_node — no update_node.
 * Fresh context, max 8 steps.
 * Used after JSON create/refine to fix structural validation errors.
 */
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { runChatToolStep } from "@/lib/ai/ai-client";
import { flowAgentLog, flowAgentWarn } from "@/lib/ai/flow-agent-log";
import { buildFlowDigest } from "@/lib/ai/flow-json-generator";
import { applyFlowTool } from "@/lib/flow/flow-tools";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { applyLayoutToFlowDocument } from "@/lib/flow/normalize-generated-flow";
import type { FlowValidationIssue } from "@/lib/flow/validate-flow-document";

const MAX_REPAIR_STEPS = 8;

const REPAIR_SYSTEM_PROMPT = `Ты исправляешь структурные ошибки в схеме Telegram-бота.
У тебя два инструмента: connect_nodes и delete_node.
Исправь все указанные ошибки — используй инструменты, не отвечай текстом.
Если ошибка — недостижимый узел, добавь connect_nodes от подходящего источника или удали узел.
Не делай лишних шагов — один инструмент на одну ошибку.`;

const REPAIR_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "connect_nodes",
      description: "Добавить связь между двумя узлами схемы.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", description: "id узла-источника" },
          target: { type: "string", description: "id узла-цели" },
          buttonText: {
            type: "string",
            description: "Текст кнопки message (если связь через кнопку)",
          },
          branch: {
            type: "string",
            enum: ["yes", "no", "success", "error", "next"],
            description: "Ветка для condition/http_request",
          },
        },
        required: ["source", "target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_node",
      description: "Удалить узел (и все его рёбра) из схемы.",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string", description: "id узла для удаления" },
        },
        required: ["nodeId"],
      },
    },
  },
];

function formatErrors(issues: FlowValidationIssue[]): string {
  return issues
    .filter((i) => i.severity === "error")
    .map((i) => `- ${i.nodeLabel ? `[${i.nodeLabel}] ` : ""}${i.message}`)
    .join("\n");
}

function runRepairTool(
  doc: BotFlowDocument,
  name: string,
  args: Record<string, unknown>,
): { doc: BotFlowDocument; changed: boolean; content: string } {
  const result = applyFlowTool(doc, name, args);
  if (result.ok) {
    return { doc: result.doc, changed: true, content: result.summary };
  }
  return { doc, changed: false, content: result.error };
}

export async function repairFlowStructure(
  doc: BotFlowDocument,
  errors: FlowValidationIssue[],
  step = runChatToolStep,
): Promise<BotFlowDocument> {
  const structuralErrors = errors.filter((i) => i.severity === "error");
  if (structuralErrors.length === 0) return doc;

  flowAgentLog("repair start", { errorCount: structuralErrors.length, maxSteps: MAX_REPAIR_STEPS });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: REPAIR_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Ошибки для исправления:\n${formatErrors(structuralErrors)}\n\n` +
        `Текущая схема:\n${buildFlowDigest(doc)}`,
    },
  ];

  let current = doc;
  let docChanged = false;

  for (let i = 0; i < MAX_REPAIR_STEPS; i++) {
    const response = await step(messages, REPAIR_TOOLS);
    if (!response) break;

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) break;

    messages.push({
      role: "assistant",
      content: response.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const fnCall = (call as { id: string; function: { name: string; arguments: string } }).function;
      const name = fnCall.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(fnCall.arguments) as Record<string, unknown>;
      } catch {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: "Ошибка: невалидный JSON аргументов",
        });
        continue;
      }

      const outcome = runRepairTool(current, name, args);
      if (outcome.changed) {
        current = outcome.doc;
        docChanged = true;
        flowAgentLog("repair ok", { step: i + 1, tool: name });
        messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
      } else {
        flowAgentWarn("repair error", { step: i + 1, tool: name, error: outcome.content });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Ошибка: ${outcome.content}`,
        });
      }
    }
  }

  if (docChanged) {
    current = applyLayoutToFlowDocument(current);
  }

  flowAgentLog("repair done", {
    docChanged,
    nodeCount: current.nodes.length,
    edgeCount: current.edges.length,
  });

  return current;
}
