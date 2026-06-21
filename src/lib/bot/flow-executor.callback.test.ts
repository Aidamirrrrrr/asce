import { describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/bot/execution-context";
import { executeFlowFromCallback, type FlowOutboundPort } from "@/lib/bot/flow-executor";
import {
  type BotFlowDocument,
  createDefaultNodeData,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
} from "@/lib/flow/flow-schema";
import { createMessageButtonId } from "@/lib/flow/message-node-utils";

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

function buildPort(): FlowOutboundPort {
  const executionContext: ExecutionContext = {
    projectId: "p1",
    chatId: 100,
    userId: 200,
    vars: {},
  };

  return {
    executionContext,
    sendText: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => ({})),
  };
}

describe("executeFlowFromCallback via trigger", () => {
  it("follows outgoing edges when a button targets a command trigger", async () => {
    const backButtonId = createMessageButtonId();
    const flow: BotFlowDocument = {
      nodes: [
        node("t", "trigger", { command: "/start", triggerType: "command" }),
        node("greet", "message", { text: "Снова привет" }),
        node("menu", "message", {
          text: "Меню",
          keyboard: {
            type: "inline",
            rows: [[{ id: backButtonId, text: "Назад", kind: "callback" }]],
          },
        }),
      ],
      edges: [
        edge("t", "greet"),
        edge("menu", "t", `btn-${backButtonId}`),
      ],
    };

    const port = buildPort();
    await executeFlowFromCallback(flow, "menu", backButtonId, "", port);

    expect(port.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Снова привет" }),
      { nodeId: "greet" },
    );
  });
});
