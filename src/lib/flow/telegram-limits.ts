import type { MessageAttachment } from "@/lib/flow/flow-schema";
import { stripTelegramHtml } from "@/lib/flow/telegram-html-preview";

/** Обычное текстовое сообщение (Bot API). */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/** Подпись к фото, видео, документу или альбому (Bot API, после парсинга entities). */
export const TELEGRAM_MAX_CAPTION_LENGTH = 1024;

export function countTelegramPlainText(text: string): number {
  return stripTelegramHtml(text).length;
}

/** Текст идёт в caption, если есть вложения кроме одиночного видеокружка. */
export function messageTextUsesMediaCaption(attachments: MessageAttachment[] | undefined): boolean {
  if (!attachments?.length) {
    return false;
  }

  if (attachments.length === 1 && attachments[0].kind === "video_note") {
    return false;
  }

  return true;
}

export function getMessageTextLimit(attachments: MessageAttachment[] | undefined): number {
  return messageTextUsesMediaCaption(attachments)
    ? TELEGRAM_MAX_CAPTION_LENGTH
    : TELEGRAM_MAX_MESSAGE_LENGTH;
}

export function truncateTelegramPlainText(text: string, maxLength: number): string {
  const plain = stripTelegramHtml(text);
  if (plain.length <= maxLength) {
    return text;
  }

  return plain.slice(0, maxLength);
}
