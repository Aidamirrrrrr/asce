import { describe, expect, it } from "vitest";

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

describe("validateFlowDocument — trigger without outgoing", () => {
  it("flags a trigger with no outgoing edge as an error", () => {
    const doc: BotFlowDocument = {
      nodes: [node("t", "trigger"), node("m", "message")],
      edges: [],
    };

    const issues = validateFlowDocument(doc);
    const triggerError = issues.find(
      (issue) => issue.severity === "error" && /исходящ/i.test(issue.message),
    );
    expect(triggerError).toBeDefined();
  });

  it("does not flag a trigger that is connected", () => {
    const doc: BotFlowDocument = {
      nodes: [node("t", "trigger"), node("m", "message")],
      edges: [edge("t", "m")],
    };

    const issues = validateFlowDocument(doc);
    expect(issues.some((issue) => /исходящ/i.test(issue.message))).toBe(false);
  });
});

describe("validateFlowDocument — обрезанные тексты сообщений", () => {
  function withMessageText(text: string): BotFlowDocument {
    return {
      nodes: [node("t", "trigger"), node("m", "message", { text })],
      edges: [edge("t", "m")],
    };
  }

  const truncErr = /обрезан/i;

  it("flags an unclosed parenthesis as truncated", () => {
    const issues = validateFlowDocument(withMessageText("Частые вопросы (FAQ"));
    expect(issues.some((i) => i.severity === "error" && truncErr.test(i.message))).toBe(true);
  });

  it("flags a dangling trailing connector char", () => {
    const issues = validateFlowDocument(withMessageText("Наши контакты и адреса:"));
    expect(issues.some((i) => i.severity === "error" && truncErr.test(i.message))).toBe(true);
  });

  it("does not flag a complete message", () => {
    const issues = validateFlowDocument(
      withMessageText("Выберите услугу из меню ниже, и мы запишем вас."),
    );
    expect(issues.some((i) => truncErr.test(i.message))).toBe(false);
  });

  it("does not flag a complete message ending with closed parenthesis", () => {
    const issues = validateFlowDocument(withMessageText("Частые вопросы (FAQ)"));
    expect(issues.some((i) => truncErr.test(i.message))).toBe(false);
  });
});

describe("validateFlowDocument — spurious next from keyboard menus", () => {
  it("flags a next edge from an inline keyboard message", () => {
    const doc: BotFlowDocument = {
      nodes: [
        node("menu", "message", {
          label: "Меню",
          text: "Выберите",
          keyboard: {
            type: "inline",
            rows: [[{ id: "b1", text: "Продукты", kind: "callback" }]],
          },
        }),
        node("branch", "message", { label: "Продукты", text: "Раздел продуктов" }),
      ],
      edges: [edge("menu", "branch", "next"), edge("menu", "branch", "btn-b1")],
    };

    const issues = validateFlowDocument(doc);
    expect(
      issues.some((issue) => issue.severity === "error" && /лишняя связь «далее»/i.test(issue.message)),
    ).toBe(true);
  });
});
