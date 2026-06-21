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

  // Hard timeout so a hanging/slow upstream (Immers.cloud) fails fast instead of
  // holding an AI-queue slot and blocking the chat's update queue. Without this
  // the OpenAI SDK default is 10 minutes, which makes the bot appear "dead" and
  // stop answering even /start while a single request hangs.
  const timeout = Number(process.env.AI_TIMEOUT_MS ?? "30000");
  const maxRetries = Number(process.env.AI_SDK_MAX_RETRIES ?? "1");

  return new OpenAI({
    apiKey,
    baseURL:
      process.env.AI_BASE_URL ??
      "https://chat.immers.cloud/v1/endpoints/qwen3-coder-next-tensor/generate",
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 1,
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

export type StreamedChatCompletion = {
  content: string;
  toolCalls: NonNullable<ChatCompletionMessage["tool_calls"]>;
  finishReason: string | null;
};

export async function createStreamingChatCompletion(
  params: Omit<OpenAI.Chat.ChatCompletionCreateParams, "stream">,
  handlers?: { onContentDelta?: (delta: string) => void },
): Promise<StreamedChatCompletion> {
  const client = getClient();
  const stream = await client.chat.completions.create({
    ...params,
    stream: true,
  });

  let content = "";
  const toolCallsByIndex = new Map<
    number,
    { id: string; name: string; arguments: string; type: "function" }
  >();
  let finishReason: string | null = null;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }

    const delta = choice?.delta;
    if (delta?.content) {
      content += delta.content;
      handlers?.onContentDelta?.(delta.content);
    }

    if (delta?.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        const index = toolCall.index;
        let accumulated = toolCallsByIndex.get(index);
        if (!accumulated) {
          accumulated = { id: "", name: "", arguments: "", type: "function" };
          toolCallsByIndex.set(index, accumulated);
        }
        if (toolCall.id) {
          accumulated.id = toolCall.id;
        }
        if (toolCall.function?.name) {
          accumulated.name = toolCall.function.name;
        }
        if (toolCall.function?.arguments) {
          accumulated.arguments += toolCall.function.arguments;
        }
      }
    }

    if (chunk.usage?.total_tokens) {
      const context = getAiUsageContext();
      if (context) {
        void recordAiUsage({ userId: context.userId, tokens: chunk.usage.total_tokens });
      }
    }
  }

  const toolCalls = [...toolCallsByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, accumulated]) => ({
      id: accumulated.id,
      type: accumulated.type,
      function: {
        name: accumulated.name,
        arguments: accumulated.arguments,
      },
    }));

  return { content, toolCalls, finishReason };
}

export async function streamGenerateAiReply(
  systemPrompt: string,
  userMessage: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const model = getAiModel();

  try {
    const { content } = await createStreamingChatCompletion(
      {
        model,
        messages: [
          { role: "system", content: `${systemPrompt}\n\n${NO_EMOJI_RULE}` },
          { role: "user", content: userMessage },
        ],
      },
      { onContentDelta: onDelta },
    );

    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("Пустой ответ от AI");
    }

    return stripTextEmojis(trimmed);
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new Error(`AI API: ${error.message}`);
    }
    throw error;
  }
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
