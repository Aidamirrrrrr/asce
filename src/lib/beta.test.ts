import { afterEach, describe, expect, it } from "vitest";

import {
  formatBetaSeatsLabel,
  getMaxBetaUsers,
  isBillingEnforced,
} from "@/lib/beta";

describe("beta access", () => {
  const originalBillingEnforced = process.env.BILLING_ENFORCED;
  const originalMaxBetaUsers = process.env.MAX_BETA_USERS;

  afterEach(() => {
    if (originalBillingEnforced === undefined) {
      delete process.env.BILLING_ENFORCED;
    } else {
      process.env.BILLING_ENFORCED = originalBillingEnforced;
    }
    if (originalMaxBetaUsers === undefined) {
      delete process.env.MAX_BETA_USERS;
    } else {
      process.env.MAX_BETA_USERS = originalMaxBetaUsers;
    }
  });

  it("disables billing enforcement by default", () => {
    delete process.env.BILLING_ENFORCED;
    expect(isBillingEnforced()).toBe(false);
  });

  it("enables billing only with BILLING_ENFORCED=1", () => {
    process.env.BILLING_ENFORCED = "1";
    expect(isBillingEnforced()).toBe(true);
  });

  it("removes beta user cap while billing is off", () => {
    delete process.env.BILLING_ENFORCED;
    process.env.MAX_BETA_USERS = "100";
    expect(getMaxBetaUsers()).toBe(0);
  });

  it("applies beta user cap when billing is enforced", () => {
    process.env.BILLING_ENFORCED = "1";
    process.env.MAX_BETA_USERS = "50";
    expect(getMaxBetaUsers()).toBe(50);
  });

  it("formats unlimited beta seats", () => {
    expect(formatBetaSeatsLabel(0)).toBe("без ограничений");
    expect(formatBetaSeatsLabel(100)).toBe("100 мест");
  });
});
