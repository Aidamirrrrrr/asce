import { compare } from "bcryptjs";
import { NextResponse } from "next/server";

import {
  generateLoginCode,
  isValidEmail,
  normalizeEmail,
  storeLoginCode,
} from "@/lib/auth/email-code";
import { db } from "@/lib/db";
import { isSmtpConfigured, sendMail } from "@/lib/email/smtp";
import { logger } from "@/lib/logger";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit/limiter";

/**
 * Второй фактор входа: проверяем email+пароль и, если верно, шлём код на почту.
 * Сам вход завершается провайдером "email-code" после ввода кода.
 */
export async function POST(request: Request) {
  if (!isSmtpConfigured()) {
    return NextResponse.json({ error: "Вход по коду временно недоступен" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = normalizeEmail(body.email ?? "");
  const password = typeof body.password === "string" ? body.password : "";
  if (!(isValidEmail(email) && password)) {
    return NextResponse.json({ error: "Укажите email и пароль" }, { status: 400 });
  }

  const ipRate = await enforceRateLimit(`email-code:ip:${getClientIp(request)}`, 20, 60 * 60);
  const emailRate = await enforceRateLimit(`email-code:addr:${email}`, 6, 10 * 60);
  if (!(ipRate.allowed && emailRate.allowed)) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429 },
    );
  }

  const user = await db.user.findUnique({ where: { email } });
  const passwordOk = user?.passwordHash ? await compare(password, user.passwordHash) : false;
  if (!passwordOk) {
    // Не раскрываем, что именно неверно.
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  const code = generateLoginCode();
  await storeLoginCode(email, code);

  try {
    await sendMail({
      to: email,
      subject: `Код для входа в asce: ${code}`,
      text: `Ваш код для входа: ${code}\nДействует 10 минут. Если вы не запрашивали вход — игнорируйте письмо.`,
      html: `<p>Ваш код для входа в <b>asce</b>:</p><p style="font-size:24px;letter-spacing:4px;font-weight:700">${code}</p><p>Действует 10 минут. Если вы не запрашивали вход — игнорируйте письмо.</p>`,
    });
  } catch (error) {
    logger.error("email_code_send_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Не удалось отправить письмо" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
