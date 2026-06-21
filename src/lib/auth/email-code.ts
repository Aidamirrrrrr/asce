import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";

/** Вход по одноразовому коду из письма. Коды хранятся хешированными в VerificationToken. */
const CODE_TTL_MS = 10 * 60 * 1000; // 10 минут

export function generateLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(email: string, code: string): string {
  const secret = process.env.AUTH_SECRET ?? "dev-only-auth-secret-change-me";
  return createHash("sha256").update(`${email}:${code}:${secret}`).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Сохраняет код для email (перетирая прежний). */
export async function storeLoginCode(email: string, code: string): Promise<void> {
  const identifier = normalizeEmail(email);
  const token = hashCode(identifier, code);
  const expires = new Date(Date.now() + CODE_TTL_MS);

  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({ data: { identifier, token, expires } });
}

/** Проверяет код и одноразово гасит его (true — верный и не истёкший). */
export async function verifyAndConsumeLoginCode(email: string, code: string): Promise<boolean> {
  const identifier = normalizeEmail(email);
  const record = await db.verificationToken.findFirst({ where: { identifier } });
  if (!record) {
    return false;
  }

  if (record.expires.getTime() < Date.now()) {
    await db.verificationToken.deleteMany({ where: { identifier } });
    return false;
  }

  const expected = hashCode(identifier, code);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(record.token, "hex");
  const ok = a.length === b.length && timingSafeEqual(a, b);

  // Код одноразовый — гасим в любом случае успеха; при неуспехе оставляем
  // (чтобы опечатка не сжигала код), но истёкшие уже удалены выше.
  if (ok) {
    await db.verificationToken.deleteMany({ where: { identifier } });
  }
  return ok;
}
