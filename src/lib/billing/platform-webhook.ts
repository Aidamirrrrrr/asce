import { nextPeriodEnd } from "@/lib/billing/period";
import { getPlan } from "@/lib/billing/plans";
import { activateSubscription } from "@/lib/billing/subscription";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { fetchPlatformPayment } from "@/lib/payments/yookassa-platform";

/**
 * Обрабатывает уведомление ЮKassa о платеже подписки. Не доверяем телу вебхука:
 * перезапрашиваем платёж через API и активируем подписку, только если статус
 * действительно succeeded. Идемпотентно по PlatformPayment.status.
 */
export async function handlePlatformPaymentWebhook(input: {
  paymentId: string;
}): Promise<{ ok: true; activated: boolean } | { ok: false; reason: string }> {
  const { paymentId } = input;

  const record = await db.platformPayment.findUnique({
    where: { provider_paymentId: { provider: "yookassa", paymentId } },
  });
  if (!record) {
    return { ok: false, reason: "Платёж не найден" };
  }
  if (record.status === "succeeded") {
    return { ok: true, activated: false };
  }

  // Источник истины — статус из API ЮKassa, а не тело уведомления.
  const payment = await fetchPlatformPayment(paymentId);

  if (payment.status === "canceled") {
    await db.platformPayment.update({
      where: { id: record.id },
      data: { status: "canceled" },
    });
    return { ok: true, activated: false };
  }

  if (payment.status !== "succeeded") {
    return { ok: true, activated: false };
  }

  const planId = (payment.metadata?.planId ?? record.planId) as string;
  const plan = getPlan(planId);
  if (plan.priceRub <= 0) {
    return { ok: false, reason: "Некорректный тариф в платеже" };
  }

  await db.platformPayment.update({
    where: { id: record.id },
    data: { status: "succeeded" },
  });

  await activateSubscription({
    userId: record.userId,
    planId: plan.id,
    currentPeriodEnd: nextPeriodEnd(),
    yookassaPaymentMethodId: payment.payment_method?.id ?? null,
  });

  logger.info("platform_subscription_activated", {
    userId: record.userId,
    planId: plan.id,
    paymentId,
  });

  return { ok: true, activated: true };
}
