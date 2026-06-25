import { describe, expect, it } from "vitest";
import { AiQuotaExceededError } from "@/lib/billing/errors";

describe("AiQuotaExceededError", () => {
  it("exposes quota metadata", () => {
    const error = new AiQuotaExceededError({ used: 100, limit: 100, planId: "free" });
    expect(error.message).toContain("лимит");
    expect(error.used).toBe(100);
    expect(error.planId).toBe("free");
  });
});
