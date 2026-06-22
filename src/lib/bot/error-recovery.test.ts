import { describe, expect, it } from "vitest";

import { RuntimeRecoveryScheduler } from "@/lib/bot/error-recovery";

describe("RuntimeRecoveryScheduler", () => {
  it("attempts immediately on first sight", () => {
    const s = new RuntimeRecoveryScheduler();
    expect(s.shouldAttempt("p1", 0)).toBe(true);
  });

  it("applies exponential backoff between attempts", () => {
    const s = new RuntimeRecoveryScheduler(1000, 60_000, 6);
    s.recordAttempt("p1", 0);
    expect(s.shouldAttempt("p1", 500)).toBe(false); // within 1000ms
    expect(s.shouldAttempt("p1", 1000)).toBe(true); // delay elapsed
    s.recordAttempt("p1", 1000);
    expect(s.shouldAttempt("p1", 1500)).toBe(false); // next delay is 2000ms
    expect(s.shouldAttempt("p1", 3000)).toBe(true);
  });

  it("stops after max attempts until success resets", () => {
    const s = new RuntimeRecoveryScheduler(1, 1, 3);
    for (let i = 0; i < 3; i++) {
      s.recordAttempt("p1", i * 10);
    }
    expect(s.isExhausted("p1")).toBe(true);
    expect(s.shouldAttempt("p1", 1_000_000)).toBe(false);

    s.recordSuccess("p1");
    expect(s.isExhausted("p1")).toBe(false);
    expect(s.shouldAttempt("p1", 0)).toBe(true);
  });

  it("tracks ids and forgets on success", () => {
    const s = new RuntimeRecoveryScheduler();
    s.recordAttempt("p1", 0);
    s.recordAttempt("p2", 0);
    expect(s.trackedIds().sort()).toEqual(["p1", "p2"]);
    s.recordSuccess("p1");
    expect(s.trackedIds()).toEqual(["p2"]);
  });
});
