import type { Plan } from "@/lib/billing/plans";

/**
 * Включить тарифы и квоты (BILLING_ENFORCED=1).
 * По умолчанию бета без ограничений.
 */
export function isBillingEnforced(): boolean {
  return process.env.BILLING_ENFORCED === "1";
}

/** Виртуальный тариф на период открытой беты. */
export const BETA_UNLIMITED_PLAN: Plan = {
  id: "business",
  name: "Beta",
  priceRub: 0,
  monthlyTokenQuota: 0,
  maxProjects: null,
  features: ["Открытая бета", "Без лимитов на ИИ и ботов"],
};

export function getBetaUnlimitedPlan(): Plan {
  return BETA_UNLIMITED_PLAN;
}

/**
 * Лимит набора пользователей на бету. Защита от перегрузки общего ИИ-эндпоинта:
 * вместе с очередью (src/lib/ai/ai-queue.ts) держит нагрузку предсказуемой.
 * 0 = без лимита. Во время открытой беты (без BILLING_ENFORCED) всегда 0.
 */
export function getMaxBetaUsers(): number {
  if (!isBillingEnforced()) {
    return 0;
  }
  const raw = Number(process.env.MAX_BETA_USERS ?? "100");
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 100;
}

export function formatBetaSeatsLabel(maxBetaUsers: number): string {
  return maxBetaUsers > 0 ? `${maxBetaUsers} мест` : "без ограничений";
}
