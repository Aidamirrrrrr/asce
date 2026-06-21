import { describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/bot/execution-context";
import { executeFlow, type FlowOutboundPort } from "@/lib/bot/flow-executor";
import {
  type BotFlowDocument,
  createDefaultNodeData,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
} from "@/lib/flow/flow-schema";

function node(id: string, type: FlowNodeType, data: Record<string, unknown> = {}): FlowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { ...createDefaultNodeData(type), ...data } as FlowNode["data"],
  };
}

function edge(source: string, target: string, sourceHandle = "next"): FlowEdge {
  return { id: `e-${source}-${sourceHandle}-${target}`, source, target, sourceHandle };
}

// trigger /start -> save_record -> message
function buildFlow(): BotFlowDocument {
  return {
    nodes: [
      node("t", "trigger"),
      node("s", "save_record", {
        collection: "leads",
        fields: [
          { key: "name", value: "{{var.buyer_name}}" },
          { key: "source", value: "bot" },
        ],
      }),
      node("m", "message", { text: "Готово" }),
    ],
    edges: [edge("t", "s"), edge("s", "m")],
  };
}

function buildPort(overrides: Partial<FlowOutboundPort> = {}): FlowOutboundPort {
  const executionContext: ExecutionContext = {
    projectId: "p1",
    chatId: 100,
    userId: 200,
    vars: { "var.buyer_name": "Vasya" },
  };

  return {
    executionContext,
    sendText: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe("save_record runtime", () => {
  it("interpolates fields and persists via the saveRecord port, then continues by next", async () => {
    const saveRecord = vi.fn(async () => {});
    const sendMessage = vi.fn(async () => ({}));
    const port = buildPort({ saveRecord, sendMessage });

    const result = await executeFlow(buildFlow(), "/start", port);

    expect(result.handled).toBe(true);
    expect(saveRecord).toHaveBeenCalledTimes(1);
    expect(saveRecord).toHaveBeenCalledWith({
      collection: "leads",
      data: { name: "Vasya", source: "bot" },
    });
    // Узел линейный — сценарий должен дойти до следующего message.
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not crash the flow when the record write fails", async () => {
    const saveRecord = vi.fn(async () => {
      throw new Error("db down");
    });
    const sendMessage = vi.fn(async () => ({}));
    const port = buildPort({ saveRecord, sendMessage });

    await expect(executeFlow(buildFlow(), "/start", port)).resolves.toMatchObject({
      handled: true,
    });
    // Несмотря на сбой записи, следующий узел выполнился.
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
