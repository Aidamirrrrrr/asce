import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetQueueForTests, getQueueState, runQueued } from "./ai-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Даёт отработать микротаскам и таймерам — детерминированнее, чем счёт Promise.resolve(). */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("ai-queue", () => {
  afterEach(() => {
    delete process.env.AI_MAX_CONCURRENCY;
    __resetQueueForTests();
  });

  it("limits concurrency to AI_MAX_CONCURRENCY", async () => {
    process.env.AI_MAX_CONCURRENCY = "2";

    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let started = 0;

    const tasks = gates.map((gate) =>
      runQueued(async () => {
        started += 1;
        await gate.promise;
      }),
    );

    await flush();
    expect(started).toBe(2); // стартовали только 2 из 3
    expect(getQueueState().waiting).toBe(1);

    gates[0].resolve();
    await flush();
    expect(started).toBe(3); // освободился слот — третий пошёл

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all(tasks);
    expect(getQueueState().active).toBe(0);
    expect(getQueueState().waiting).toBe(0);
  });

  it("calls onQueued when no slot is free", async () => {
    process.env.AI_MAX_CONCURRENCY = "1";
    const gate = deferred<void>();
    const onQueued = vi.fn();

    const first = runQueued(() => gate.promise);
    const second = runQueued(async () => undefined, { onQueued });

    await flush();
    expect(onQueued).toHaveBeenCalledWith(1);

    gate.resolve();
    await Promise.all([first, second]);
  });

  it("releases the slot even if the task throws", async () => {
    process.env.AI_MAX_CONCURRENCY = "1";
    await expect(
      runQueued(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(getQueueState().active).toBe(0);
  });
});
