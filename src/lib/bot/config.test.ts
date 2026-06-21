import { afterEach, describe, expect, it } from "vitest";

import { getDefaultDeliveryMode, resolveDeliveryMode } from "./config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolveDeliveryMode", () => {
  it("uses BOT_DELIVERY_MODE when set", () => {
    process.env.BOT_DELIVERY_MODE = "polling";
    process.env.NODE_ENV = "production";
    expect(resolveDeliveryMode("webhook")).toBe("polling");
    expect(getDefaultDeliveryMode()).toBe("polling");
  });

  it("defaults to polling in development", () => {
    delete process.env.BOT_DELIVERY_MODE;
    process.env.NODE_ENV = "development";
    expect(resolveDeliveryMode("webhook")).toBe("polling");
  });

  it("defaults to webhook in production without override", () => {
    delete process.env.BOT_DELIVERY_MODE;
    process.env.NODE_ENV = "production";
    expect(resolveDeliveryMode()).toBe("webhook");
    expect(resolveDeliveryMode("polling")).toBe("polling");
  });
});
