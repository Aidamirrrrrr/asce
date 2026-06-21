import { describe, expect, it } from "vitest";

import { autoRepairFlowDocument } from "@/lib/flow/auto-repair-flow";
import {
  type BotFlowDocument,
  createDefaultNodeData,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
} from "@/lib/flow/flow-schema";
import { validateFlowDocument } from "@/lib/flow/validate-flow-document";

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

function outHandles(doc: BotFlowDocument, nodeId: string): Set<string> {
  return new Set(doc.edges.filter((e) => e.source === nodeId).map((e) => e.sourceHandle ?? "next"));
}

function errorCount(doc: BotFlowDocument): number {
  return validateFlowDocument(doc).filter((issue) => issue.severity === "error").length;
}

describe("autoRepairFlowDocument", () => {
  it("wires the error branch of an http_request with no error edge", () => {
    const doc: BotFlowDocument = {
      nodes: [node("t", "trigger"), node("h", "http_request"), node("m", "message")],
      edges: [edge("t", "h"), edge("h", "m", "success")],
    };

    const { doc: repaired, repairs } = autoRepairFlowDocument(doc);

    expect(outHandles(repaired, "h").has("error")).toBe(true);
    expect(repairs.length).toBeGreaterThan(0);
    expect(errorCount(repaired)).toBe(0);
  });

  it("wires the no branch of a condition with no negative edge", () => {
    const doc: BotFlowDocument = {
      nodes: [
        node("t", "trigger"),
        node("c", "condition", { rules: [{ id: "r1", type: "has_username", expected: true }] }),
        node("m", "message"),
      ],
      edges: [edge("t", "c"), edge("c", "m", "yes")],
    };

    const { doc: repaired } = autoRepairFlowDocument(doc);

    expect(outHandles(repaired, "c").has("no")).toBe(true);
    expect(errorCount(repaired)).toBe(0);
  });

  it("connects a trigger that has no outgoing edge", () => {
    const doc: BotFlowDocument = {
      nodes: [node("t", "trigger"), node("m", "message")],
      edges: [],
    };
    expect(errorCount(doc)).toBeGreaterThan(0); // триггер без выхода + недостижимый узел

    const { doc: repaired } = autoRepairFlowDocument(doc);

    expect(outHandles(repaired, "t").size).toBeGreaterThan(0);
    expect(errorCount(repaired)).toBe(0);
  });

  it("connects an unreachable node when the source is unambiguous", () => {
    const doc: BotFlowDocument = {
      nodes: [node("t", "trigger"), node("a", "message"), node("b", "message")],
      edges: [edge("t", "a")],
    };

    const { doc: repaired } = autoRepairFlowDocument(doc);

    const reachableFromA = repaired.edges.some((e) => e.source === "a" && e.target === "b");
    expect(reachableFromA).toBe(true);
  });

  it("converges dead-end service branches into the shared follow-up (barbershop case)", () => {
    // trigger (disconnected) ; menu -> 3x set_variable ; only one continues to wait_input
    const doc: BotFlowDocument = {
      nodes: [
        node("t", "trigger"),
        node("menu", "message", {
          text: "Выберите услугу",
          keyboard: {
            type: "inline",
            rows: [
              [
                { id: "1", text: "Мужская", kind: "callback" },
                { id: "2", text: "Женская", kind: "callback" },
                { id: "3", text: "Борода", kind: "callback" },
              ],
            ],
          },
        }),
        node("sv1", "set_variable", { variableKey: "service", value: "Мужская" }),
        node("sv2", "set_variable", { variableKey: "service", value: "Женская" }),
        node("sv3", "set_variable", { variableKey: "service", value: "Борода" }),
        node("ask", "wait_input", { variableKey: "name" }),
        node("save", "save_record", { collection: "appointments" }),
      ],
      edges: [
        edge("menu", "sv1", "btn-1"),
        edge("menu", "sv2", "btn-2"),
        edge("menu", "sv3", "btn-3"),
        edge("sv1", "ask"),
        edge("ask", "save"),
      ],
    };

    const { doc: repaired } = autoRepairFlowDocument(doc);

    // Триггер подключён к меню.
    expect(repaired.edges.some((e) => e.source === "t" && e.target === "menu")).toBe(true);
    // Все три ветки услуг сходятся в общий сбор имени.
    for (const sv of ["sv1", "sv2", "sv3"]) {
      expect(repaired.edges.some((e) => e.source === sv && e.target === "ask")).toBe(true);
    }
    // Недостижимых узлов не осталось.
    const unreachableWarning = validateFlowDocument(repaired).find((i) =>
      /недостижим/i.test(i.message),
    );
    expect(unreachableWarning).toBeUndefined();
  });

  it("wires dangling service branches to orphan shared message (agent built chain without merge)", () => {
    const doc: BotFlowDocument = {
      nodes: [
        node("t", "trigger"),
        node("menu", "message", {
          text: "Выберите услугу",
          keyboard: {
            type: "inline",
            rows: [
              [
                { id: "1", text: "Мужская стрижка", kind: "callback" },
                { id: "2", text: "Женская стрижка", kind: "callback" },
                { id: "3", text: "Борода", kind: "callback" },
              ],
            ],
          },
        }),
        node("sv1", "set_variable", { variableKey: "service", value: "Мужская стрижка" }),
        node("sv2", "set_variable", { variableKey: "service", value: "Женская стрижка" }),
        node("sv3", "set_variable", { variableKey: "service", value: "Борода" }),
        node("ask", "message", { label: "Вопрос: имя", text: "Как вас зовут?" }),
        node("wait", "wait_input", { variableKey: "client_name" }),
      ],
      edges: [
        edge("t", "menu"),
        edge("menu", "sv1", "btn-1"),
        edge("menu", "sv2", "btn-2"),
        edge("menu", "sv3", "btn-3"),
        edge("ask", "wait"),
      ],
    };

    const { doc: repaired } = autoRepairFlowDocument(doc);

    for (const sv of ["sv1", "sv2", "sv3"]) {
      expect(repaired.edges.some((e) => e.source === sv && e.target === "ask")).toBe(true);
    }
  });

  it("is a no-op on an already valid flow", () => {
    const doc: BotFlowDocument = {
      nodes: [node("t", "trigger"), node("m", "message")],
      edges: [edge("t", "m")],
    };

    const { doc: repaired, repairs } = autoRepairFlowDocument(doc);

    expect(repairs).toHaveLength(0);
    expect(repaired.nodes).toHaveLength(2);
  });
});
