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
