/** Текст кнопки в Telegram Bot API (UTF-16 code units). */
export const TELEGRAM_MAX_BUTTON_TEXT_LENGTH = 64;

export function getButtonTextLength(text: string): number {
  return text.length;
}

export function isValidButtonText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= TELEGRAM_MAX_BUTTON_TEXT_LENGTH;
}

export function clampButtonText(text: string): string {
  return text.slice(0, TELEGRAM_MAX_BUTTON_TEXT_LENGTH);
}
