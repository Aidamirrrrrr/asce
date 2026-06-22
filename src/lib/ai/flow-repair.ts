/**
 * Short structural repair loop.
 * Tools: connect_nodes, delete_node, update_node, add_node — enough to add a
 * missing button (update_node keyboard) or insert a json_extract for an unfilled
 * variable (add_node), not just rewire existing nodes.
 * Fresh context, max 10 steps.
 * Used after JSON create/refine to fix structural validation errors.
 */
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { runChatToolStep } from "@/lib/ai/ai-client";
import { flowAgentLog, flowAgentWarn } from "@/lib/ai/flow-agent-log";
import { buildFlowDigest } from "@/lib/ai/flow-json-generator";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { applyFlowTool } from "@/lib/flow/flow-tools";
import { applyLayoutToFlowDocument } from "@/lib/flow/normalize-generated-flow";
import type { FlowValidationIssue } from "@/lib/flow/validate-flow-document";

const MAX_REPAIR_STEPS = 10;

const REPAIR_SYSTEM_PROMPT = `Ты исправляешь структурные ошибки в схеме Telegram-бота.
Инструменты: connect_nodes, delete_node, update_node, add_node.
Исправь ВСЕ указанные ошибки — используй инструменты, не отвечай текстом.

Рецепты под частые ошибки:
- «Узел недостижим» → подключи входящую связь от подходящего меню/шага через connect_nodes (по кнопке — buttonText), либо удали узел, если он лишний.
- «Кнопка ни к чему не подключена» → connect_nodes от source с buttonText = текст кнопки.
- «Меню без кнопки на раздел» → update_node добавь кнопку в keyboard, затем connect_nodes с buttonText.
  Формат клавиатуры: data.keyboard = { "type": "inline", "rows": [[{ "id": "b1", "text": "Текст кнопки", "kind": "callback" }]] }.
- «Переменная {{var.X}} не заполняется ни одним узлом» И есть http_request с ответом в var.response →
  add_node type=json_extract afterNodeId=<id http_request> branch=success
  data={ "sourceVariable": "response", "path": "<путь_в_JSON>", "targetVariable": "X" },
  затем connect_nodes от нового json_extract к узлу, который использует {{var.X}}.
  Путь бери из реального формата API (например для cbr-xml-daily.ru: Valute.USD.Value).
- Если переменную взять неоткуда — добавь form/wait_input/set_variable выше по цепочке.

Один инструмент — одно осмысленное действие. Не делай лишних шагов.`;

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
  {
    type: "function",
    function: {
      name: "update_node",
      description:
        "Изменить данные узла (например добавить клавиатуру/кнопку message или дописать текст).",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string", description: "id изменяемого узла" },
          data: {
            type: "object",
            description:
              "Патч данных узла (сливается с текущими). Для кнопок: { keyboard: { type, rows } }.",
            additionalProperties: true,
          },
        },
        required: ["nodeId", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_node",
      description:
        "Добавить новый узел (например json_extract для извлечения значения из HTTP-ответа).",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Тип узла: json_extract, message, set_variable, form, wait_input, …",
          },
          data: {
            type: "object",
            description: "Данные нового узла.",
            additionalProperties: true,
          },
          afterNodeId: {
            type: "string",
            description: "id узла, после которого подключить новый (создаст ребро).",
          },
          branch: {
            type: "string",
            enum: ["yes", "no", "success", "error", "next"],
            description: "Ветка от afterNodeId (для http_request обычно success).",
          },
        },
        required: ["type", "data"],
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
      const fnCall = (call as { id: string; function: { name: string; arguments: string } })
        .function;
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
