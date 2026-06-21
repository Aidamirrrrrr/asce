import { runFlowAgent } from "@/lib/ai/flow-agent";
import { buildLlmServiceErrorMessage, isLlmServiceError } from "@/lib/ai/llm-retry";
import { createDefaultFlow, createEmptyFlow } from "@/lib/flow/default-flow";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
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

/** Последний резерв, если агент не смог собрать схему (например, шлюз без function-calling). */
function buildFallbackFlow(prompt: string): {
  flow: BotFlowDocument;
  assistantMessage: string;
} {
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
      "Не удалось полностью сгенерировать сценарий через AI — применён базовый шаблон. Отредактируйте блоки на холсте.",
  };
}

function buildHistoryContext(chatHistory: ProjectChatMessage[]): string {
  const snippet = chatHistory
    .slice(-6)
    .map(
      (message) => `${message.role === "user" ? "Пользователь" : "Ассистент"}: ${message.content}`,
    )
    .join("\n");

  return snippet ? `История чата:\n${snippet}\n\n` : "";
}

function handleFlowAgentError(error: unknown, prompt: string): FlowGenerationResult {
  if (isLlmServiceError(error)) {
    throw new Error(buildLlmServiceErrorMessage(error));
  }

  const fallback = buildFallbackFlow(prompt);
  return {
    flow: fallback.flow,
    assistantMessage: fallback.assistantMessage,
  };
}

export async function generateFlowFromPrompt(
  prompt: string,
  callbacks?: FlowStreamCallbacks,
): Promise<FlowGenerationResult> {
  const trimmed = prompt.trim();

  try {
    return await runFlowAgent({
      mode: "create",
      baseDoc: createEmptyFlow(),
      instruction: trimmed,
      callbacks,
    });
  } catch (error) {
    return handleFlowAgentError(error, trimmed);
  }
}

export async function refineFlowFromInstruction({
  currentFlow,
  instruction,
  chatHistory = [],
  callbacks,
}: {
  currentFlow: BotFlowDocument;
  instruction: string;
  chatHistory?: ProjectChatMessage[];
  callbacks?: FlowStreamCallbacks;
}): Promise<FlowGenerationResult> {
  const trimmed = instruction.trim();
  const instructionWithContext = `${buildHistoryContext(chatHistory)}${trimmed}`;

  try {
    return await runFlowAgent({
      mode: "refine",
      baseDoc: currentFlow,
      instruction: instructionWithContext,
      callbacks,
    });
  } catch (error) {
    return handleFlowAgentError(error, trimmed);
  }
}
