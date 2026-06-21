import { describe, expect, it } from "vitest";

import { currentPeriodKey, nextPeriodEnd } from "./period";

describe("period", () => {
  it("formats the period key as YYYY-MM in UTC", () => {
    expect(currentPeriodKey(new Date("2026-06-20T10:00:00Z"))).toBe("2026-06");
    expect(currentPeriodKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(currentPeriodKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });

  it("advances the period end by one month", () => {
    const end = nextPeriodEnd(new Date("2026-06-20T10:00:00Z"));
    expect(end.getUTCFullYear()).toBe(2026);
    expect(end.getUTCMonth()).toBe(6); // июль (0-indexed)
  });

  it("rolls over the year boundary", () => {
    const end = nextPeriodEnd(new Date("2026-12-15T00:00:00Z"));
    expect(end.getUTCFullYear()).toBe(2027);
    expect(end.getUTCMonth()).toBe(0); // январь
  });
});
