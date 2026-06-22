import { jsonCreateFlow, jsonRefineFlow } from "@/lib/ai/flow-json-generator";
import { repairFlowStructure } from "@/lib/ai/flow-repair";
import { buildLlmServiceErrorMessage, isLlmServiceError } from "@/lib/ai/llm-retry";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { deterministicRepair } from "@/lib/flow/deterministic-repair";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { validateFlowDocument } from "@/lib/flow/validate-flow-document";
import type { ProjectChatMessage } from "@/lib/projects";

export type FlowStreamCallbacks = {
  onPartialFlow?: (flow: BotFlowDocument, nodeCount: number) => void;
  /** Агент составил план сборки (set_plan). */
  onPlan?: (items: string[]) => void;
  /** Индексы выполненных пунктов плана (mark_done). */
  onPlanProgress?: (done: number[]) => void;
};

export type FlowGenerationResult = {
  flow: BotFlowDocument;
  name?: string;
  assistantMessage: string;
  stepLimitReached?: boolean;
};

function buildFallbackFlow(prompt: string): { flow: BotFlowDocument; assistantMessage: string } {
  const flow = createDefaultFlow();

  for (const node of flow.nodes) {
    if (node.type === "message") {
      node.data = { ...node.data, text: "Привет! Я готов помочь. Напишите ваш вопрос." };
    }

    if (node.type === "ai_reply") {
      node.data = {
        ...node.data,
        systemPrompt: `Ты Telegram-бот. Задача пользователя: ${prompt.trim()}. Отвечай по-русски, кратко и по делу.`,
      };
    }
  }

  return {
    flow,
    assistantMessage:
      "Не удалось сгенерировать сценарий через AI — применён базовый шаблон. Отредактируйте блоки на холсте.",
  };
}

function handleFlowError(error: unknown, prompt: string): FlowGenerationResult {
  if (isLlmServiceError(error)) {
    throw new Error(buildLlmServiceErrorMessage(error));
  }

  const fallback = buildFallbackFlow(prompt);
  return { flow: fallback.flow, assistantMessage: fallback.assistantMessage };
}

export async function generateFlowFromPrompt(
  prompt: string,
  callbacks?: FlowStreamCallbacks,
  projectId?: string,
): Promise<FlowGenerationResult> {
  const trimmed = prompt.trim();

  try {
    // Phase 1: JSON generation (one LLM call, ~3-5s)
    const generated = await jsonCreateFlow(trimmed);

    // Phase 2: deterministic repair (free, no LLM) for unambiguous defects.
    const repaired = deterministicRepair(generated.flow).doc;
    callbacks?.onPartialFlow?.(repaired, repaired.nodes.length);

    // Phase 3: targeted LLM repair (only if validation errors remain)
    const errors = validateFlowDocument(repaired);
    const structuralErrors = errors.filter((i) => i.severity === "error");
    const flow =
      structuralErrors.length > 0
        ? await repairFlowStructure(repaired, structuralErrors)
        : repaired;

    return {
      flow,
      name: generated.name,
      assistantMessage: generated.assistantMessage,
      stepLimitReached: false,
    };
  } catch (error) {
    return handleFlowError(error, trimmed);
  }
}

export async function refineFlowFromInstruction({
  currentFlow,
  instruction,
  chatHistory = [],
  callbacks,
  projectId,
}: {
  currentFlow: BotFlowDocument;
  instruction: string;
  chatHistory?: ProjectChatMessage[];
  callbacks?: FlowStreamCallbacks;
  projectId?: string;
}): Promise<FlowGenerationResult> {
  const trimmed = instruction.trim();

  try {
    // Phase 1: JSON delta generation (one LLM call)
    const refined = await jsonRefineFlow(currentFlow, trimmed, chatHistory);

    // Phase 2: deterministic repair (free, no LLM) for unambiguous defects.
    const repaired = deterministicRepair(refined.flow).doc;
    callbacks?.onPartialFlow?.(repaired, repaired.nodes.length);

    // Phase 3: targeted LLM repair if structural errors remain
    const errors = validateFlowDocument(repaired);
    const structuralErrors = errors.filter((i) => i.severity === "error");
    const flow =
      structuralErrors.length > 0
        ? await repairFlowStructure(repaired, structuralErrors)
        : repaired;

    return {
      flow,
      assistantMessage: refined.assistantMessage,
      stepLimitReached: false,
    };
  } catch (error) {
    return handleFlowError(error, trimmed);
  }
}
