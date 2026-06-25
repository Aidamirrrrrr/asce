import { getBetaUnlimitedPlan, isBillingEnforced } from "@/lib/beta";
import { AiQuotaExceededError } from "@/lib/billing/errors";
import { currentPeriodKey } from "@/lib/billing/period";
import type { Plan } from "@/lib/billing/plans";
import { resolveActivePlan } from "@/lib/billing/subscription";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export type QuotaStatus = {
  plan: Plan;
  period: string;
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  /** Квота не применяется (открытая бета). */
  unlimited: boolean;
};

/** Сумма израсходованных ИИ-токенов пользователя за текущий месяц. */
export async function getMonthlyTokens(userId: string, now: Date = new Date()): Promise<number> {
  const row = await db.aiUsage.findUnique({
    where: { userId_period: { userId, period: currentPeriodKey(now) } },
  });
  return row?.tokens ?? 0;
}

export async function getQuotaStatus(userId: string, now: Date = new Date()): Promise<QuotaStatus> {
  const used = await getMonthlyTokens(userId, now);
  const period = currentPeriodKey(now);

  if (!isBillingEnforced()) {
    return {
      plan: getBetaUnlimitedPlan(),
      period,
      used,
      limit: 0,
      remaining: 0,
      exceeded: false,
      unlimited: true,
    };
  }

  const plan = await resolveActivePlan(userId);
  const limit = plan.monthlyTokenQuota;
  return {
    plan,
    period,
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    exceeded: used >= limit,
    unlimited: false,
  };
}

/**
 * Проверка квоты перед дорогим ИИ-вызовом. Бросает AiQuotaExceededError,
 * если месячный лимит тарифа уже выбран.
 */
export async function assertAiQuota(userId: string, now: Date = new Date()): Promise<void> {
  if (!isBillingEnforced()) {
    return;
  }
  const status = await getQuotaStatus(userId, now);
  if (status.exceeded) {
    throw new AiQuotaExceededError({
      used: status.used,
      limit: status.limit,
      planId: status.plan.id,
    });
  }
}

/** Списывает израсходованные токены на пользователя за текущий период. */
export async function recordAiUsage(input: {
  userId: string;
  tokens: number;
  now?: Date;
}): Promise<void> {
  const { userId } = input;
  const tokens = Math.max(0, Math.round(input.tokens));
  if (tokens === 0) {
    return;
  }
  const period = currentPeriodKey(input.now ?? new Date());

  try {
    await db.aiUsage.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, tokens, calls: 1 },
      update: { tokens: { increment: tokens }, calls: { increment: 1 } },
    });
  } catch (error) {
    // Учёт расхода не должен ронять основной ИИ-поток — логируем и продолжаем.
    logger.warn("ai_usage_record_failed", {
      userId,
      tokens,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
