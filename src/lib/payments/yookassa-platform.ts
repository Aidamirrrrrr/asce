import { randomUUID } from "node:crypto";

/**
 * Клиент ЮKassa для платежей самой ПЛАТФОРМЫ (оплата подписки конструктора).
 * Отличается от платежей внутри ботов: использует общий shopId/secretKey
 * платформы из env, а не секреты проекта.
 */
const YOOKASSA_API = "https://api.yookassa.ru/v3";

export type PlatformPaymentMetadata = {
  userId: string;
  planId: string;
  kind: "platform_subscription";
};

export type YooKassaPaymentObject = {
  id: string;
  status: string;
  paid?: boolean;
  amount?: { value?: string; currency?: string };
  confirmation?: { confirmation_url?: string };
  payment_method?: { id?: string; saved?: boolean };
  metadata?: Record<string, string>;
};

function getCredentials(): { shopId: string; secretKey: string } {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!(shopId && secretKey)) {
    throw new Error("YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY не настроены");
  }
  return { shopId, secretKey };
}

export function isPlatformYooKassaConfigured(): boolean {
  return Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim());
}

function authHeader(): string {
  const { shopId, secretKey } = getCredentials();
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`;
}

function formatAmount(rub: number): string {
  return rub.toFixed(2);
}

/** Создаёт платёж ЮKassa и возвращает URL для редиректа на оплату. */
export async function createPlatformPayment(input: {
  amountRub: number;
  description: string;
  returnUrl: string;
  metadata: PlatformPaymentMetadata;
  /** Сохранить способ оплаты для последующих автоплатежей подписки. */
  savePaymentMethod?: boolean;
}): Promise<YooKassaPaymentObject> {
  const response = await fetch(`${YOOKASSA_API}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Idempotence-Key": randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: { value: formatAmount(input.amountRub), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: input.description,
      save_payment_method: input.savePaymentMethod ?? true,
      metadata: input.metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa: создание платежа не удалось (${response.status}): ${text}`);
  }

  return (await response.json()) as YooKassaPaymentObject;
}

/**
 * Перезапрос статуса платежа по его id — единственный надёжный способ убедиться,
 * что платёж действительно оплачен (не полагаемся только на тело вебхука).
 */
export async function fetchPlatformPayment(paymentId: string): Promise<YooKassaPaymentObject> {
  const response = await fetch(`${YOOKASSA_API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa: получение платежа не удалось (${response.status}): ${text}`);
  }

  return (await response.json()) as YooKassaPaymentObject;
}
