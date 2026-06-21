import { describe, expect, it } from "vitest";

import { buildDagreNodePositions } from "@/lib/flow/flow-dagre-layout";
import {
  type BotFlowDocument,
  createDefaultNodeData,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
} from "@/lib/flow/flow-schema";
import { normalizeMessageNodeData } from "@/lib/flow/message-node-utils";
import { applyLayoutToFlowDocument } from "@/lib/flow/normalize-generated-flow";

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

describe("buildGeneratedNodePositions", () => {
  it("completes when multiple linear branches converge into one node", () => {
    const menu = node("message-menu", "message", {
      text: "Выберите услугу",
      keyboard: {
        type: "inline",
        rows: [
          [
            { id: "btn-a", text: "Услуга A", type: "callback" },
            { id: "btn-b", text: "Услуга B", type: "callback" },
          ],
        ],
      },
    });
    const normalizedMenu = {
      ...menu,
      data: normalizeMessageNodeData(menu.data),
    };
    const handles =
      normalizedMenu.data.keyboard?.type === "inline"
        ? (normalizedMenu.data.keyboard.rows[0]?.map((button) => button.id) ?? [])
        : [];

    const doc: BotFlowDocument = {
      nodes: [
        node("trigger-1", "trigger", { command: "/start" }),
        normalizedMenu,
        node("set-a", "set_variable", { variableKey: "service", value: "A" }),
        node("set-b", "set_variable", { variableKey: "service", value: "B" }),
        node("message-common", "message", { text: "Введите имя" }),
      ],
      edges: [
        edge("trigger-1", "message-menu"),
        edge("message-menu", "set-a", handles[0] ?? "btn-a"),
        edge("message-menu", "set-b", handles[1] ?? "btn-b"),
        edge("set-a", "message-common"),
        edge("set-b", "message-common"),
      ],
    };

    const startedAt = Date.now();
    const positions = buildDagreNodePositions(doc.nodes, doc.edges);
    const laidOut = applyLayoutToFlowDocument(doc);

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(positions.size).toBe(doc.nodes.length);
    expect(laidOut.nodes.every((item) => item.position.x >= 0)).toBe(true);
  });
});
