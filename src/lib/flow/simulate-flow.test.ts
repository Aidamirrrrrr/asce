import { describe, expect, it } from "vitest";

import {
  type BotFlowDocument,
  createDefaultNodeData,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
} from "@/lib/flow/flow-schema";
import { simulateFlow } from "@/lib/flow/simulate-flow";

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

describe("simulateFlow", () => {
  it("flags a variable used before it is produced upstream (order-aware)", () => {
    // var.code produced AFTER the message that uses it → globally exists, locally empty.
    const doc: BotFlowDocument = {
      nodes: [
        node("start", "trigger"),
        node("show", "message", { label: "Покажи код", text: "Ваш код: {{var.code}}" }),
        node("ask", "form", { questions: [{ prompt: "Код?", variableKey: "code", type: "text" }] }),
      ],
      edges: [edge("start", "show"), edge("show", "ask")],
    };

    const { issues } = simulateFlow(doc);
    expect(
      issues.some((i) => i.severity === "error" && /раньше, чем создаются/i.test(i.message)),
    ).toBe(true);
  });

  it("does not flag when producer is upstream of the consumer", () => {
    const doc: BotFlowDocument = {
      nodes: [
        node("start", "trigger"),
        node("ask", "form", { questions: [{ prompt: "Имя?", variableKey: "name", type: "text" }] }),
        node("show", "message", { label: "Привет", text: "Привет, {{var.name}}!" }),
      ],
      edges: [edge("start", "ask"), edge("ask", "show")],
    };

    const { issues } = simulateFlow(doc);
    expect(issues.some((i) => /раньше, чем создаются/i.test(i.message))).toBe(false);
  });

  it("warns about an infinite auto-loop without a user-input step", () => {
    const doc: BotFlowDocument = {
      nodes: [
        node("start", "trigger"),
        node("a", "message", { label: "A", text: "A" }),
        node("b", "message", { label: "B", text: "B" }),
      ],
      edges: [edge("start", "a"), edge("a", "b"), edge("b", "a")],
    };

    const { issues } = simulateFlow(doc);
    expect(
      issues.some((i) => i.severity === "warning" && /бесконечный цикл/i.test(i.message)),
    ).toBe(true);
  });

  it("does not warn about a menu loop that has a user-input step", () => {
    const doc: BotFlowDocument = {
      nodes: [
        node("start", "trigger"),
        node("menu", "message", {
          label: "Меню",
          text: "Выберите",
          keyboard: { type: "inline", rows: [[{ id: "b1", text: "Раздел", kind: "callback" }]] },
        }),
        node("section", "message", {
          label: "Раздел",
          text: "Контент",
          keyboard: { type: "inline", rows: [[{ id: "back", text: "Назад", kind: "callback" }]] },
        }),
      ],
      edges: [
        edge("start", "menu"),
        edge("menu", "section", "btn-b1"),
        edge("section", "menu", "btn-back"),
      ],
    };

    const { issues } = simulateFlow(doc);
    expect(issues.some((i) => /бесконечный цикл/i.test(i.message))).toBe(false);
  });

  it("produces a dialog transcript along the happy path", () => {
    const doc: BotFlowDocument = {
      nodes: [
        node("start", "trigger"),
        node("hi", "message", { label: "Привет", text: "Здравствуйте, {{first_name}}!" }),
      ],
      edges: [edge("start", "hi")],
    };

    const { transcript } = simulateFlow(doc);
    expect(transcript).toHaveLength(1);
    expect(transcript[0]?.text).toContain("Алексей");
  });
});
