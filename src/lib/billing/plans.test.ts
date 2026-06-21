import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_PLAN_ID, estimatePlanMargin, getPlan, isPaidPlan, PLANS } from "./plans";

describe("plans", () => {
  afterEach(() => {
    delete process.env.AI_COST_PER_1M_RUB;
  });

  it("falls back to the default plan for unknown ids", () => {
    expect(getPlan("nope").id).toBe(DEFAULT_PLAN_ID);
    expect(getPlan(undefined).id).toBe(DEFAULT_PLAN_ID);
    expect(getPlan("pro").id).toBe("pro");
  });

  it("marks paid plans correctly", () => {
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("business")).toBe(true);
  });

  it("keeps paid plans profitable at the default AI cost (биллинг не провальный)", () => {
    for (const plan of [PLANS.pro, PLANS.business]) {
      const margin = estimatePlanMargin(plan);
      expect(margin.aiCostRub).toBeGreaterThan(0);
      expect(margin.marginRub).toBeGreaterThan(0);
    }
  });

  it("reflects a higher AI cost in the margin estimate", () => {
    process.env.AI_COST_PER_1M_RUB = "700";
    const margin = estimatePlanMargin(PLANS.pro);
    // 1.5M tokens * 700/1M = 1050 руб себестоимости при цене 990 → убыток.
    expect(margin.aiCostRub).toBeCloseTo(1050, 5);
    expect(margin.marginRub).toBeLessThan(0);
  });
});
