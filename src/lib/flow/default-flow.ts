import { buildRowNodePosition, streamNodeId } from "@/lib/flow/flow-layout";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";

export function createEmptyFlow(): BotFlowDocument {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function createStreamingSeedFlow(): BotFlowDocument {
  const triggerId = streamNodeId(0);

  return {
    nodes: [
      {
        id: triggerId,
        type: "trigger",
        position: buildRowNodePosition(0),
        data: { label: "Старт", command: "/start", triggerType: "command" },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function createDefaultFlow(): BotFlowDocument {
  return {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: buildRowNodePosition(0),
        data: { label: "Старт", command: "/start", triggerType: "command" },
      },
      {
        id: "message-1",
        type: "message",
        position: buildRowNodePosition(1),
        data: { label: "Приветствие", text: "Привет! Чем помочь?", parseMode: "HTML" },
      },
      {
        id: "ai-1",
        type: "ai_reply",
        position: buildRowNodePosition(2),
        data: {
          label: "AI-ответ",
          systemPrompt: "Отвечай на вопросы пользователя по теме бота.",
        },
      },
    ],
    edges: [
      { id: "e-trigger-message", source: "trigger-1", target: "message-1" },
      {
        id: "e-message-ai",
        source: "message-1",
        target: "ai-1",
        sourceHandle: "next",
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
