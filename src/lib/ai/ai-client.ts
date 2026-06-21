import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import { flowAgentLog, flowAgentWarn } from "@/lib/ai/flow-agent-log";
import {
  getLlmMaxRetries,
  getLlmRetryBaseMs,
  isRetryableLlmError,
  sleep,
} from "@/lib/ai/llm-retry";
import { recordAiUsage } from "@/lib/billing/ai-usage";
import { getAiUsageContext } from "@/lib/billing/ai-usage-context";
import { stripTextEmojis } from "@/lib/text/strip-emojis";

const NO_EMOJI_RULE = "Не используй эмодзи и смайлики в ответах.";

export function getAiClient(): OpenAI {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error("AI_API_KEY не задан");
  }

  return new OpenAI({
    apiKey,
    baseURL:
      process.env.AI_BASE_URL ??
      "https://chat.immers.cloud/v1/endpoints/qwen3-coder-next-tensor/generate",
  });
}

export function getAiModel(): string {
  return process.env.AI_MODEL ?? "Qwen3-Coder-Next";
}

function getClient(): OpenAI {
  return getAiClient();
}

/** Списывает токены ответа на пользователя из текущего контекста учёта (если он задан). */
export function meterChatUsage(response: ChatCompletion): void {
  meterUsage(response);
}

function meterUsage(response: ChatCompletion): void {
  const context = getAiUsageContext();
  if (!context) {
    return;
  }
  const tokens = response.usage?.total_tokens ?? 0;
  if (tokens > 0) {
    void recordAiUsage({ userId: context.userId, tokens });
  }
}

/**
 * Один шаг tool-calling диалога. Возвращает сообщение ассистента (с возможными tool_calls).
 */
export async function runChatToolStep(
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
): Promise<ChatCompletionMessage | undefined> {
  const client = getClient();
  const model = getAiModel();
  const startedAt = Date.now();

  flowAgentLog("llm request", {
    model,
    messageCount: messages.length,
    toolCount: tools.length,
  });

  const maxRetries = getLlmMaxRetries();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: "auto",
        // Усилие/детерминизм агента: низкая температура для стабильного tool-calling,
        // запас по выходным токенам, чтобы длинные ходы со множеством tool_calls не обрезались
        // (при нехватке бюджета JSON аргументов tool_call рвётся → тексты узлов обрезаны).
        temperature: Number(process.env.AI_TEMPERATURE ?? "0.2"),
        max_tokens: Number(process.env.AI_MAX_TOKENS ?? "16000"),
      });

      meterUsage(response);
      const finishReason = response.choices[0]?.finish_reason ?? null;
      const message = response.choices[0]?.message;
      if (finishReason === "length") {
        // Ответ упёрся в лимит токенов — велик риск обрезанного tool_call/текста.
        // Валидация (looksTruncatedText) поймает это и заставит агента дописать.
        flowAgentWarn("llm response truncated by length", {
          attempt,
          toolCallCount: message?.tool_calls?.length ?? 0,
        });
      }
      flowAgentLog("llm response", {
        durationMs: Date.now() - startedAt,
        attempt,
        finishReason,
        toolCallCount: message?.tool_calls?.length ?? 0,
        hasText: Boolean(
          typeof message?.content === "string" ? message.content.trim() : message?.content,
        ),
      });

      return message;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableLlmError(error);
      flowAgentWarn("llm error", {
        durationMs: Date.now() - startedAt,
        attempt,
        maxRetries,
        retryable,
        message: error instanceof Error ? error.message : String(error),
      });

      if (!retryable || attempt >= maxRetries) {
        throw error;
      }

      const delayMs = getLlmRetryBaseMs() * 2 ** (attempt - 1);
      flowAgentLog("llm retry", { attempt: attempt + 1, delayMs });
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("Не удалось выполнить запрос к ИИ");
}

function extractMessageContent(
  content: string | Array<{ type: string; text?: string }> | null | undefined,
): string {
  if (!content) {
    throw new Error("Пустой ответ от AI");
  }

  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

export async function generateAiReply(systemPrompt: string, userMessage: string): Promise<string> {
  const client = getClient();
  const model = process.env.AI_MODEL ?? "Qwen3-Coder-Next";

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: `${systemPrompt}\n\n${NO_EMOJI_RULE}` },
        { role: "user", content: userMessage },
      ],
    });

    meterUsage(response);
    return stripTextEmojis(extractMessageContent(response.choices[0]?.message?.content));
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new Error(`AI API: ${error.message}`);
    }
    throw error;
  }
}
