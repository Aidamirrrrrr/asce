import { NextResponse } from "next/server";

import { loadProjectSecrets } from "@/lib/bot/project-secrets";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { handleYooKassaPaymentNotification } from "@/lib/payments/payment-flow-bridge";
import {
  parseYooKassaNotification,
  verifyYooKassaWebhookSignature,
} from "@/lib/payments/yookassa-webhook";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit/limiter";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

/** HTTP-уведомления ЮKassa (прямой API, не Telegram Payments). */
export async function POST(request: Request, context: RouteContext) {
  try {
    const rate = await enforceRateLimit(`webhook:yookassa:${getClientIp(request)}`, 120, 60);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }

    const { projectId } = await context.params;
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });

    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    const rawBody = await request.text();
    const secrets = await loadProjectSecrets(projectId);
    const secretKey = secrets["secret.YOOKASSA_SECRET_KEY"];
    const signature = request.headers.get("content-signature");

    if (!secretKey) {
      return NextResponse.json({ error: "YOOKASSA_SECRET_KEY не настроен" }, { status: 503 });
    }

    if (!verifyYooKassaWebhookSignature(rawBody, signature, secretKey)) {
      logger.warn("yookassa_invalid_signature", { projectId });
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const notification = parseYooKassaNotification(rawBody);
    if (!notification) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const result = await handleYooKassaPaymentNotification({ projectId, notification });
    if (!result.ok) {
      logger.warn("yookassa_payment_rejected", { projectId, reason: result.reason });
      return NextResponse.json({ error: result.reason }, { status: 422 });
    }

    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    logger.error("yookassa_webhook_error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка webhook ЮKassa" },
      { status: 500 },
    );
  }
}
