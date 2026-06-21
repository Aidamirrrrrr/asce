import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isSmtpConfigured, sendMail } from "@/lib/email/smtp";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

const MAX_MESSAGE_LENGTH = 4000;

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  if (!isSmtpConfigured()) {
    return NextResponse.json({ error: "Отправка отзывов временно недоступна" }, { status: 503 });
  }

  const rate = await enforceRateLimit(`feedback:${authResult.userId}`, 5, 10 * 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Слишком много отзывов подряд. Попробуйте позже." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { message?: string; contact?: string };
  const message = body.message?.trim() ?? "";
  const contact = body.contact?.trim() ?? "";
  if (!message) {
    return NextResponse.json({ error: "Напишите сообщение" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: authResult.userId },
    select: { email: true, name: true },
  });
  const to = process.env.FEEDBACK_TO?.trim() || "hello@asce.tech";
  const from = user?.email || "пользователь";

  try {
    await sendMail({
      to,
      subject: `asce · отзыв от ${from}`,
      text: [
        message,
        "",
        "—",
        `Пользователь: ${user?.name ?? "—"} <${user?.email ?? "—"}> (id: ${authResult.userId})`,
        contact ? `Контакт для связи: ${contact}` : null,
      ]
        .filter((line) => line !== null)
        .join("\n"),
    });
  } catch (error) {
    logger.error("feedback_send_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Не удалось отправить отзыв" }, { status: 502 });
  }

  // Лог на случай, если письмо не дойдёт — отзыв не потеряется в логах.
  logger.info("feedback_received", { userId: authResult.userId, length: message.length });
  return NextResponse.json({ ok: true });
}
