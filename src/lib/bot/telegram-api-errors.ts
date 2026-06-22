import { GrammyError } from "grammy";

export function formatTelegramBotApiError(error: unknown, context: string): string {
  if (error instanceof GrammyError) {
    if (error.error_code === 404) {
      return `${context}: неверный токен бота. Проверьте токен в @BotFather и в настройках проекта.`;
    }

    if (error.error_code === 401) {
      return `${context}: токен бота отклонён Telegram (401). Замените токен в настройках.`;
    }

    if (error.error_code === 400 && /https/i.test(error.description)) {
      return `${context}: для webhook нужен публичный HTTPS-адрес в APP_URL (например https://asce.tech).`;
    }

    if (error.error_code === 400 && /webhook/i.test(error.description)) {
      return `${context}: Telegram не принял URL webhook — проверьте APP_URL и доступность сайта снаружи. (${error.description})`;
    }

    return `${context}: ${error.description} (${error.error_code})`;
  }

  if (error instanceof Error) {
    return `${context}: ${error.message}`;
  }

  return `${context}: неизвестная ошибка`;
}

/**
 * Транзиентна ли ошибка рантайма (по тексту lastError)? Транзиентные ошибки
 * (сеть, таймаут, 429, 5xx) имеет смысл авто-ретраить. Перманентные (битый/
 * отозванный токен — 401/404) ретраить бессмысленно: бот будет падать вновь,
 * нужно вмешательство пользователя (заменить токен).
 */
export function isTransientRuntimeError(lastError: string | null | undefined): boolean {
  if (!lastError?.trim()) {
    // Нет текста ошибки — считаем транзиентной (даём шанс на восстановление).
    return true;
  }
  const permanent =
    /\b401\b|\b404\b|unauthorized|forbidden|неверн\w* токен|токен .*откл|замените токен/i;
  return !permanent.test(lastError);
}
