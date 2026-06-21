import type { AiReplyNodeData } from "@/lib/flow/flow-schema";

export const DEFAULT_AI_REPLY_SYSTEM_PROMPT = "Отвечай на вопросы пользователя.";

export function normalizeAiReplyNodeData(data: Partial<AiReplyNodeData>): AiReplyNodeData {
  return {
    label: (typeof data.label === "string" ? data.label.trim() : "") || "AI-ответ",
    systemPrompt:
      (typeof data.systemPrompt === "string" ? data.systemPrompt.trim() : "") ||
      DEFAULT_AI_REPLY_SYSTEM_PROMPT,
  };
}
