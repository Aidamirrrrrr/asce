import { describe, expect, it, vi } from "vitest";
import {
  consumeFlowGenerationStream,
  encodeFlowGenerationSse,
  type FlowGenerationStreamEvent,
} from "@/lib/ai/flow-generation-stream";

function sseResponse(events: FlowGenerationStreamEvent[]): Response {
  const body = events.map(encodeFlowGenerationSse).join("");
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function chunkedSseResponse(events: FlowGenerationStreamEvent[]): Response {
  const body = events.map(encodeFlowGenerationSse).join("");
  const encoder = new TextEncoder();
  const splitAt = Math.max(1, Math.floor(body.length / 2));
  const first = body.slice(0, splitAt);
  const second = body.slice(splitAt);

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(first));
        controller.enqueue(encoder.encode(second));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

describe("encodeFlowGenerationSse", () => {
  it("serializes plan and plan_progress events", () => {
    expect(encodeFlowGenerationSse({ type: "plan", items: ["Старт", "Меню"] })).toBe(
      'data: {"type":"plan","items":["Старт","Меню"]}\n\n',
    );
    expect(encodeFlowGenerationSse({ type: "plan_progress", done: [0, 2] })).toBe(
      'data: {"type":"plan_progress","done":[0,2]}\n\n',
    );
  });
});

describe("consumeFlowGenerationStream", () => {
  it("dispatches status, plan, and plan_progress handlers", async () => {
    const onStatus = vi.fn();
    const onPlan = vi.fn();
    const onPlanProgress = vi.fn();

    await consumeFlowGenerationStream(
      sseResponse([
        { type: "status", message: "Генерируем сценарий..." },
        { type: "plan", items: ["Старт", "Меню"] },
        { type: "plan_progress", done: [0] },
      ]),
      { onStatus, onPlan, onPlanProgress },
    );

    expect(onStatus).toHaveBeenCalledWith("Генерируем сценарий...");
    expect(onPlan).toHaveBeenCalledWith(["Старт", "Меню"]);
    expect(onPlanProgress).toHaveBeenCalledWith([0]);
  });

  it("parses SSE split across multiple chunks", async () => {
    const onPlan = vi.fn();
    const onPlanProgress = vi.fn();

    await consumeFlowGenerationStream(
      chunkedSseResponse([
        { type: "plan", items: ["A", "B", "C"] },
        { type: "plan_progress", done: [0, 1] },
      ]),
      { onPlan, onPlanProgress },
    );

    expect(onPlan).toHaveBeenCalledWith(["A", "B", "C"]);
    expect(onPlanProgress).toHaveBeenCalledWith([0, 1]);
  });

  it("throws on error events after calling onError", async () => {
    const onError = vi.fn();

    await expect(
      consumeFlowGenerationStream(sseResponse([{ type: "error", message: "Сбой" }]), { onError }),
    ).rejects.toThrow("Сбой");

    expect(onError).toHaveBeenCalledWith("Сбой");
  });
});
