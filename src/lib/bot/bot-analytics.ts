import type { Context } from "grammy";

import { db } from "@/lib/db";

export type BotEventType =
  | "message_in"
  | "message_out"
  | "command"
  | "callback"
  | "node_executed"
  | "error"
  | "payment_succeeded";

/**
 * Запись пользователя бота (приватные 1:1 чаты) — основа аналитики «сколько пользователей».
 * Не бросает исключений: аналитика не должна ломать обработку сообщений.
 */
export async function recordBotUserFromContext(projectId: string, ctx: Context): Promise<void> {
  try {
    const chat = ctx.chat;
    const from = ctx.from;
    if (!chat || chat.type !== "private" || !from || from.is_bot) {
      return;
    }

    const userId = String(from.id);
    const profile = {
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      languageCode: from.language_code ?? null,
      isPremium: Boolean((from as { is_premium?: boolean }).is_premium),
      isBot: Boolean(from.is_bot),
    };

    await db.botUser.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: {
        projectId,
        userId,
        chatId: String(chat.id),
        ...profile,
        messageCount: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      update: {
        ...profile,
        chatId: String(chat.id),
        blocked: false,
        messageCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
    });
  } catch (error) {
    console.error("recordBotUserFromContext error:", error);
  }
}

export async function recordBotEvent(
  projectId: string,
  event: {
    type: BotEventType;
    userId?: string | number | null;
    chatId?: string | number | null;
    nodeId?: string | null;
    meta?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await db.botEvent.create({
      data: {
        projectId,
        type: event.type,
        userId: event.userId != null ? String(event.userId) : null,
        chatId: event.chatId != null ? String(event.chatId) : null,
        nodeId: event.nodeId ?? null,
        meta: event.meta ? JSON.stringify(event.meta) : null,
      },
    });
  } catch (error) {
    console.error("recordBotEvent error:", error);
  }
}

/** Пометить пользователя заблокировавшим бота (по ошибке отправки 403). */
export async function markBotUserBlocked(
  projectId: string,
  chatId: string | number,
): Promise<void> {
  try {
    await db.botUser.updateMany({
      where: { projectId, chatId: String(chatId) },
      data: { blocked: true },
    });
  } catch (error) {
    console.error("markBotUserBlocked error:", error);
  }
}
