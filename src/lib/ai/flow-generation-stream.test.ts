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
  it("serializes phase and transcript events", () => {
    expect(encodeFlowGenerationSse({ type: "phase", phase: "plan", status: "active" })).toContain(
      '"type":"phase"',
    );
    expect(
      encodeFlowGenerationSse({
        type: "transcript",
        steps: [{ nodeId: "m1", type: "message", label: "Привет", text: "Здравствуйте" }],
      }),
    ).toContain('"type":"transcript"');
  });
});

describe("consumeFlowGenerationStream", () => {
  it("dispatches status, plan, and phase handlers", async () => {
    const onStatus = vi.fn();
    const onPlan = vi.fn();
    const onPhase = vi.fn();

    await consumeFlowGenerationStream(
      sseResponse([
        { type: "status", message: "Генерируем сценарий..." },
        { type: "plan", items: ["Старт", "Меню"] },
        { type: "phase", phase: "structure", status: "active" },
      ]),
      { onStatus, onPlan, onPhase },
    );

    expect(onStatus).toHaveBeenCalledWith("Генерируем сценарий...");
    expect(onPlan).toHaveBeenCalledWith(["Старт", "Меню"]);
    expect(onPhase).toHaveBeenCalledWith("structure", "active", undefined);
  });

  it("parses SSE split across multiple chunks", async () => {
    const onTranscript = vi.fn();
    const onValidation = vi.fn();

    await consumeFlowGenerationStream(
      chunkedSseResponse([
        {
          type: "transcript",
          steps: [{ nodeId: "m1", type: "message", label: "A", text: "B" }],
        },
        { type: "validation", errors: [], warnings: ["hint"] },
      ]),
      { onTranscript, onValidation },
    );

    expect(onTranscript).toHaveBeenCalledWith([
      { nodeId: "m1", type: "message", label: "A", text: "B" },
    ]);
    expect(onValidation).toHaveBeenCalledWith([], ["hint"]);
  });

  it("dispatches assistant_delta and assistant_reset handlers", async () => {
    const onAssistantDelta = vi.fn();
    const onAssistantReset = vi.fn();

    await consumeFlowGenerationStream(
      sseResponse([{ type: "assistant_delta", delta: "Привет" }, { type: "assistant_reset" }]),
      { onAssistantDelta, onAssistantReset },
    );

    expect(onAssistantDelta).toHaveBeenCalledWith("Привет");
    expect(onAssistantReset).toHaveBeenCalledTimes(1);
  });

  it("throws on error events after calling onError", async () => {
    const onError = vi.fn();

    await expect(
      consumeFlowGenerationStream(sseResponse([{ type: "error", message: "Сбой" }]), { onError }),
    ).rejects.toThrow("Сбой");

    expect(onError).toHaveBeenCalledWith("Сбой");
  });
});
