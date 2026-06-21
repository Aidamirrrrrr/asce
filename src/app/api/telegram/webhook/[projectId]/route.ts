import type { Update } from "grammy/types";
import { NextResponse } from "next/server";

import { createProjectBot } from "@/lib/bot/create-project-bot";
import { withDecryptedBotToken } from "@/lib/bot/project-token";
import { getUpdateChatId, runSerializedByKey } from "@/lib/bot/update-queue";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
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

    const update = (await request.json()) as Update;

    // Ack Telegram immediately and process the update in the background. Flow
    // execution can take longer than Telegram's webhook timeout (e.g. slow AI
    // replies); blocking here makes Telegram retry and duplicate updates.
    // Safe because the app runs as a single long-lived process (see memory).
    // Updates are serialized per chat so concurrent messages from the same
    // conversation don't race on the shared session store.
    const chatId = getUpdateChatId(update);
    const queueKey = `${projectId}:${chatId ?? "unknown"}`;

    logger.info("telegram_webhook_received", {
      projectId,
      chatId: chatId ?? null,
      updateId: update.update_id,
      kind: update.message
        ? "message"
        : update.callback_query
          ? "callback_query"
          : Object.keys(update).find((k) => k !== "update_id"),
      text: update.message?.text ?? update.callback_query?.data ?? null,
    });

    void runSerializedByKey(queueKey, async () => {
      const startedAt = Date.now();
      try {
        const bot = createProjectBot(withDecryptedBotToken(project));
        await bot.init();
        await bot.handleUpdate(update);
        logger.info("telegram_webhook_processed", {
          projectId,
          chatId: chatId ?? null,
          updateId: update.update_id,
          ms: Date.now() - startedAt,
        });
      } catch (error) {
        logger.error("telegram_webhook_update_error", {
          projectId,
          chatId: chatId ?? null,
          updateId: update.update_id,
          ms: Date.now() - startedAt,
          message: error instanceof Error ? error.message : "unknown",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    });

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    logger.error("telegram_webhook_error", {
      message: error instanceof Error ? error.message : "unknown",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка webhook" },
      { status: 500 },
    );
  }
}
