import type { Context } from "grammy";

import { db } from "@/lib/db";

const TRACKED_CHAT_TYPES = new Set(["group", "supergroup", "channel"]);

export type KnownChatRecord = {
  id: string;
  chatId: string;
  title: string;
  username: string | null;
  chatType: string;
  botIsAdmin: boolean;
  lastSeenAt: Date;
};

function getChatTitle(chat: NonNullable<Context["chat"]>): string {
  if ("title" in chat && typeof chat.title === "string" && chat.title.trim()) {
    return chat.title.trim();
  }

  if ("username" in chat && typeof chat.username === "string" && chat.username.trim()) {
    return `@${chat.username.trim()}`;
  }

  return String(chat.id);
}

export async function upsertKnownChatFromContext(
  projectId: string,
  ctx: Context,
  options?: { botIsAdmin?: boolean },
): Promise<void> {
  const chat = ctx.chat;
  if (!(chat && TRACKED_CHAT_TYPES.has(chat.type))) {
    return;
  }

  const chatId = String(chat.id);
  const title = getChatTitle(chat);
  const username = "username" in chat && chat.username ? chat.username : null;

  await db.projectKnownChat.upsert({
    where: {
      projectId_chatId: { projectId, chatId },
    },
    create: {
      projectId,
      chatId,
      title,
      username,
      chatType: chat.type,
      botIsAdmin: options?.botIsAdmin ?? false,
      lastSeenAt: new Date(),
    },
    update: {
      title,
      username,
      chatType: chat.type,
      ...(options?.botIsAdmin !== undefined ? { botIsAdmin: options.botIsAdmin } : {}),
      lastSeenAt: new Date(),
    },
  });
}

export async function upsertKnownChatFromApiChat(
  projectId: string,
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
  },
  options?: { botIsAdmin?: boolean },
): Promise<KnownChatRecord> {
  if (!TRACKED_CHAT_TYPES.has(chat.type)) {
    throw new Error("Поддерживаются только группы, супергруппы и каналы");
  }

  const chatId = String(chat.id);
  const title = chat.title?.trim() || (chat.username ? `@${chat.username}` : chatId);

  const record = await db.projectKnownChat.upsert({
    where: {
      projectId_chatId: { projectId, chatId },
    },
    create: {
      projectId,
      chatId,
      title,
      username: chat.username ?? null,
      chatType: chat.type,
      botIsAdmin: options?.botIsAdmin ?? false,
      lastSeenAt: new Date(),
    },
    update: {
      title,
      username: chat.username ?? null,
      chatType: chat.type,
      ...(options?.botIsAdmin !== undefined ? { botIsAdmin: options.botIsAdmin } : {}),
      lastSeenAt: new Date(),
    },
  });

  return record;
}

export async function listProjectKnownChats(projectId: string): Promise<KnownChatRecord[]> {
  return db.projectKnownChat.findMany({
    where: { projectId },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      chatId: true,
      title: true,
      username: true,
      chatType: true,
      botIsAdmin: true,
      lastSeenAt: true,
    },
  });
}

export function isBotAdminStatus(status: string): boolean {
  return status === "administrator" || status === "creator";
}
