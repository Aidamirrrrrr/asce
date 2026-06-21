import { webhookCallback } from "grammy";
import { NextResponse } from "next/server";

import { createProjectBot } from "@/lib/bot/create-project-bot";
import { withDecryptedBotToken } from "@/lib/bot/project-token";
import { db } from "@/lib/db";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit/limiter";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const rate = await enforceRateLimit(`webhook:telegram:${getClientIp(request)}`, 300, 60);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }

    const { projectId } = await context.params;
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");

    const project = await db.project.findUnique({ where: { id: projectId } });

    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    if (!(secret && project.webhookSecret) || secret !== project.webhookSecret) {
      return NextResponse.json({ error: "Недопустимый секрет webhook" }, { status: 403 });
    }

    if (project.runtimeStatus !== "running" || project.deliveryMode !== "webhook") {
      return NextResponse.json({ error: "Бот не запущен в режиме webhook" }, { status: 409 });
    }

    if (!project.botToken) {
      return NextResponse.json({ error: "Токен бота не задан" }, { status: 400 });
    }

    const bot = createProjectBot(withDecryptedBotToken(project));
    const handleWebhook = webhookCallback(bot, "std/http");

    return await handleWebhook(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка webhook" },
      { status: 500 },
    );
  }
}
