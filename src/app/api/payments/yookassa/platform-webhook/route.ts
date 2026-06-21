import { NextResponse } from "next/server";

import { handlePlatformPaymentWebhook } from "@/lib/billing/platform-webhook";
import { verifyHmacSha256Hex } from "@/lib/crypto/secrets-crypto";
import { logger } from "@/lib/logger";
import { parseYooKassaNotification } from "@/lib/payments/yookassa-webhook";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit/limiter";

/**
 * Webhook ЮKassa для платежей ПЛАТФОРМЫ (подписки). Если задан
 * YOOKASSA_NOTIFICATION_SECRET — проверяем подпись; в любом случае статус
 * платежа перепроверяется через API в обработчике (источник истины).
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(
      `webhook:yookassa-platform:${getClientIp(request)}`,
      120,
      60,
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }

    const rawBody = await request.text();

    const notificationSecret = process.env.YOOKASSA_NOTIFICATION_SECRET?.trim();
    if (notificationSecret) {
      const signature = request.headers.get("content-signature");
      if (!verifyHmacSha256Hex(rawBody, notificationSecret, signature ?? "")) {
        logger.warn("yookassa_platform_invalid_signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const notification = parseYooKassaNotification(rawBody);
    if (!notification) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (notification.event !== "payment.succeeded") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const result = await handlePlatformPaymentWebhook({ paymentId: notification.object.id });
    if (!result.ok) {
      logger.warn("yookassa_platform_rejected", { reason: result.reason });
      return NextResponse.json({ error: result.reason }, { status: 422 });
    }

    return NextResponse.json({ ok: true, activated: result.activated });
  } catch (error) {
    logger.error("yookassa_platform_webhook_error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Ошибка webhook" }, { status: 500 });
  }
}
