/** Превышена месячная квота ИИ-токенов по тарифу пользователя. */
export class AiQuotaExceededError extends Error {
  readonly used: number;
  readonly limit: number;
  readonly planId: string;

  constructor(input: { used: number; limit: number; planId: string }) {
    super("Достигнут месячный лимит ИИ по вашему тарифу");
    this.name = "AiQuotaExceededError";
    this.used = input.used;
    this.limit = input.limit;
    this.planId = input.planId;
  }
}

export function isAiQuotaExceededError(error: unknown): error is AiQuotaExceededError {
  return error instanceof AiQuotaExceededError;
}
