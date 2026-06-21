import { Bot } from "grammy";
import { NextResponse } from "next/server";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import {
  isBotAdminStatus,
  listProjectKnownChats,
  upsertKnownChatFromApiChat,
} from "@/lib/bot/known-chats";
import { requireDecryptedBotToken } from "@/lib/bot/project-token";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const { id: projectId } = await context.params;
    const owned = await getOwnedProject(authResult.userId, projectId);
    if ("error" in owned) {
      return owned.error;
    }

    const chats = await listProjectKnownChats(projectId);
    return NextResponse.json({ chats });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Неизвестная ошибка" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const { id: projectId } = await context.params;
    const owned = await getOwnedProject(authResult.userId, projectId);
    if ("error" in owned) {
      return owned.error;
    }

    const project = owned.project;

    if (!project.botToken) {
      return NextResponse.json({ error: "Токен бота не задан" }, { status: 400 });
    }

    const body = (await request.json()) as { chatId?: string };
    const chatId = body.chatId?.trim();
    if (!chatId) {
      return NextResponse.json({ error: "Укажите chat_id или @username" }, { status: 400 });
    }

    const bot = new Bot(requireDecryptedBotToken(project));
    const chat = await bot.api.getChat(chatId);
    const me = await bot.api.getMe();

    let botIsAdmin = false;
    try {
      const selfMember = await bot.api.getChatMember(chat.id, me.id);
      botIsAdmin = isBotAdminStatus(selfMember.status);
    } catch {
      botIsAdmin = false;
    }

    const record = await upsertKnownChatFromApiChat(
      projectId,
      {
        id: chat.id,
        type: chat.type,
        title: "title" in chat ? chat.title : undefined,
        username: "username" in chat ? chat.username : undefined,
      },
      { botIsAdmin },
    );

    return NextResponse.json({ chat: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить чат";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
