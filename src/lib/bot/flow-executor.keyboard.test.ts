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

describe("message keyboard guard", () => {
  it("does not auto-follow a spurious next edge after an inline keyboard message", async () => {
    const buttonId = createMessageButtonId();
    const flow: BotFlowDocument = {
      nodes: [
        node("t", "trigger", { command: "/start", triggerType: "command" }),
        node("menu", "message", {
          text: "Choose a topic",
          keyboard: {
            type: "inline",
            rows: [[{ id: buttonId, text: "Products", kind: "callback" }]],
          },
        }),
        node("branch", "message", { text: "You chose products" }),
      ],
      edges: [
        edge("t", "menu"),
        edge("menu", "branch", "next"),
        edge("menu", "branch", `btn-${buttonId}`),
      ],
    };

    const port = buildPort();
    const result = await executeFlow(flow, "/start", port);

    expect(result.handled).toBe(true);
    expect(port.sendMessage).toHaveBeenCalledTimes(1);
    expect(port.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Choose a topic" }),
      { nodeId: "menu" },
    );
  });
});
