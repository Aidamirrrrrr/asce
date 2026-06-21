import OpenAI from "openai";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 1500;

export function getLlmMaxRetries(): number {
  const parsed = Number(process.env.AI_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_RETRIES;
}

export function getLlmRetryBaseMs(): number {
  const parsed = Number(process.env.AI_RETRY_BASE_MS ?? DEFAULT_RETRY_BASE_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RETRY_BASE_MS;
}

export function isRetryableLlmError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return error.status === 429 || error.status >= 500;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("something went wrong") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("socket hang up") ||
      message.includes("network") ||
      /\b5\d{2}\b/.test(message)
    );
  }

  return false;
}

/** Ошибка шлюза ИИ — не подменяем сценарий базовым шаблоном. */
export function isLlmServiceError(error: unknown): boolean {
  if (isRetryableLlmError(error)) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("ai_api_key") ||
      message.includes("не задан") ||
      message.includes("ai api") ||
      message.includes("openai")
    );
  }

  return false;
}

export function buildLlmServiceErrorMessage(error: unknown): string {
  if (error instanceof OpenAI.APIError && error.status === 429) {
    return "Сервис ИИ перегружен. Подождите немного и попробуйте снова.";
  }

  if (isRetryableLlmError(error)) {
    return "Сервис ИИ временно недоступен. Попробуйте ещё раз через минуту.";
  }

  return error instanceof Error ? error.message : "Сервис ИИ временно недоступен.";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
