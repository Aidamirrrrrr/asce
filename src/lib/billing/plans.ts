/**
 * Тарифы платформы. Квота ИИ задаётся в токенах в месяц — это прямой драйвер
 * себестоимости (провайдер ИИ тарифицирует по токенам). Цена тарифа должна
 * покрывать `monthlyTokenQuota * costPer1MTokens` с маржой — см. estimatePlanMargin().
 */
export type PlanId = "free" | "pro" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  /** Цена в рублях за месяц (0 для free). */
  priceRub: number;
  /** Лимит ИИ-токенов в календарный месяц. */
  monthlyTokenQuota: number;
  /** Максимум проектов (ботов). null = без лимита. */
  maxProjects: number | null;
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceRub: 0,
    monthlyTokenQuota: 150_000,
    maxProjects: 1,
    features: ["1 бот", "150K ИИ-токенов в месяц", "Базовая аналитика"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceRub: 990,
    monthlyTokenQuota: 1_500_000,
    maxProjects: 10,
    features: [
      "До 10 ботов",
      "1.5M ИИ-токенов в месяц",
      "Платежи в ботах",
      "Приоритетная очередь ИИ",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    priceRub: 2990,
    monthlyTokenQuota: 6_000_000,
    maxProjects: null,
    features: [
      "Без лимита ботов",
      "6M ИИ-токенов в месяц",
      "Платежи в ботах",
      "Все возможности Pro",
    ],
  },
};

export const DEFAULT_PLAN_ID: PlanId = "free";

export function getPlan(planId: string | null | undefined): Plan {
  if (planId && planId in PLANS) {
    return PLANS[planId as PlanId];
  }
  return PLANS[DEFAULT_PLAN_ID];
}

export function isPaidPlan(planId: string | null | undefined): boolean {
  return getPlan(planId).priceRub > 0;
}

/**
 * Себестоимость ИИ за 1M токенов в рублях. Дефолт консервативный (≈ перепродажная
 * с запасом к цене провайдера). ВАЖНО: подставьте реальный прайс провайдера
 * в AI_COST_PER_1M_RUB — тест plans.test.ts проверяет, что тарифы остаются
 * прибыльными при этой себестоимости.
 */
export function getCostPer1MTokensRub(): number {
  return Number(process.env.AI_COST_PER_1M_RUB ?? "400");
}

/**
 * Оценка маржи тарифа при полной выборке квоты. Положительное значение = прибыльно.
 * Используется в тестах, чтобы биллинг не был «провальным».
 */
export function estimatePlanMargin(plan: Plan): {
  revenueRub: number;
  aiCostRub: number;
  marginRub: number;
} {
  const aiCostRub = (plan.monthlyTokenQuota / 1_000_000) * getCostPer1MTokensRub();
  return {
    revenueRub: plan.priceRub,
    aiCostRub,
    marginRub: plan.priceRub - aiCostRub,
  };
}
