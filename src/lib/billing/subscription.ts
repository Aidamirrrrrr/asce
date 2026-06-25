import { getBetaUnlimitedPlan, isBillingEnforced } from "@/lib/beta";
import { DEFAULT_PLAN_ID, getPlan, type Plan, type PlanId } from "@/lib/billing/plans";
import { db } from "@/lib/db";

/**
 * Действующий тариф пользователя. Подписка считается активной, пока
 * status=active и не истёк currentPeriodEnd; иначе откатываемся на free.
 */
export async function resolveActivePlan(userId: string): Promise<Plan> {
  if (!isBillingEnforced()) {
    return getBetaUnlimitedPlan();
  }

  const subscription = await db.subscription.findUnique({ where: { userId } });
  if (!subscription || subscription.status !== "active") {
    return getPlan(DEFAULT_PLAN_ID);
  }

  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() < Date.now()) {
    return getPlan(DEFAULT_PLAN_ID);
  }

  return getPlan(subscription.planId);
}

/** Активирует/продлевает подписку после успешной оплаты. */
export async function activateSubscription(input: {
  userId: string;
  planId: PlanId;
  currentPeriodEnd: Date;
  yookassaPaymentMethodId?: string | null;
}): Promise<void> {
  const { userId, planId, currentPeriodEnd, yookassaPaymentMethodId } = input;
  await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planId,
      status: "active",
      currentPeriodEnd,
      yookassaPaymentMethodId: yookassaPaymentMethodId ?? null,
    },
    update: {
      planId,
      status: "active",
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      ...(yookassaPaymentMethodId ? { yookassaPaymentMethodId } : {}),
    },
  });
}
