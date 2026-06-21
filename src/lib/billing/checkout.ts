import { getPlan, isPaidPlan, type PlanId } from "@/lib/billing/plans";
import { db } from "@/lib/db";
import {
  createPlatformPayment,
  isPlatformYooKassaConfigured,
} from "@/lib/payments/yookassa-platform";

export type CheckoutResult =
  | { ok: true; confirmationUrl: string; paymentId: string }
  | { ok: false; status: number; error: string };

/** Создаёт платёж ЮKassa за подписку и сохраняет PlatformPayment(pending). */
export async function startSubscriptionCheckout(input: {
  userId: string;
  planId: string;
  returnUrl: string;
}): Promise<CheckoutResult> {
  const { userId, returnUrl } = input;

  if (!isPaidPlan(input.planId)) {
    return { ok: false, status: 400, error: "Тариф недоступен для оплаты" };
  }
  if (!isPlatformYooKassaConfigured()) {
    return { ok: false, status: 503, error: "Платежи временно недоступны" };
  }

  const plan = getPlan(input.planId);

  let payment: Awaited<ReturnType<typeof createPlatformPayment>>;
  try {
    payment = await createPlatformPayment({
      amountRub: plan.priceRub,
      description: `Подписка «${plan.name}» — Telegram Bot Builder`,
      returnUrl,
      savePaymentMethod: true,
      metadata: { userId, planId: plan.id, kind: "platform_subscription" },
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Ошибка платёжного провайдера",
    };
  }

  const confirmationUrl = payment.confirmation?.confirmation_url;
  if (!confirmationUrl) {
    return { ok: false, status: 502, error: "ЮKassa не вернула ссылку на оплату" };
  }

  await db.platformPayment.create({
    data: {
      userId,
      provider: "yookassa",
      paymentId: payment.id,
      planId: plan.id,
      amount: plan.priceRub.toFixed(2),
      currency: "RUB",
      status: "pending",
    },
  });

  return { ok: true, confirmationUrl, paymentId: payment.id };
}

export function isValidPaidPlanId(planId: string): planId is PlanId {
  return isPaidPlan(planId);
}
