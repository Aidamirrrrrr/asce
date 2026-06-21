import { afterEach, describe, expect, it } from "vitest";

import {
  isBotWorkerProcess,
  isPollingDelegatedToWorker,
  shouldRunPollingInThisProcess,
} from "./bot-runtime-mode";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("bot-runtime-mode", () => {
  it("detects worker process", () => {
    process.env.BOT_WORKER_PROCESS = "1";
    expect(isBotWorkerProcess()).toBe(true);
    expect(shouldRunPollingInThisProcess()).toBe(true);
  });

  it("delegates polling in development by default", () => {
    delete process.env.BOT_WORKER_PROCESS;
    delete process.env.BOT_POLLING_DELEGATED;
    process.env.NODE_ENV = "development";
    expect(isPollingDelegatedToWorker()).toBe(true);
    expect(shouldRunPollingInThisProcess()).toBe(false);
  });

  it("allows in-process polling when explicitly disabled", () => {
    process.env.BOT_POLLING_DELEGATED = "0";
    process.env.NODE_ENV = "development";
    expect(isPollingDelegatedToWorker()).toBe(false);
    expect(shouldRunPollingInThisProcess()).toBe(true);
  });
});
