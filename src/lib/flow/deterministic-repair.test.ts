import { describe, expect, it } from "vitest";

import { deterministicRepair } from "@/lib/flow/deterministic-repair";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";

describe("deterministicRepair", () => {
  it("removes spurious next edge from a keyboard menu", () => {
    const doc: BotFlowDocument = {
      nodes: [
        { id: "start", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Старт" } },
        {
          id: "menu",
          type: "message",
          position: { x: 0, y: 0 },
          data: {
            label: "Меню",
            text: "Выберите",
            keyboard: {
              type: "inline",
              rows: [[{ id: "b1", text: "Продукты", kind: "callback" }]],
            },
          },
        },
        {
          id: "branch",
          type: "message",
          position: { x: 0, y: 0 },
          data: { label: "Продукты", text: "Раздел" },
        },
      ],
      edges: [
        { id: "e0", source: "start", target: "menu", sourceHandle: "next" },
        { id: "e1", source: "menu", target: "branch", sourceHandle: "next" },
        { id: "e2", source: "menu", target: "branch", sourceHandle: "btn-b1" },
      ],
    };

    const result = deterministicRepair(doc);
    expect(result.changed).toBe(true);
    expect(
      result.doc.edges.some((e) => e.source === "menu" && (e.sourceHandle ?? "next") === "next"),
    ).toBe(false);
    expect(result.doc.edges.some((e) => e.sourceHandle === "btn-b1")).toBe(true);
  });

  it("leaves a clean linear flow untouched", () => {
    const doc: BotFlowDocument = {
      nodes: [
        { id: "start", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Старт" } },
        {
          id: "hi",
          type: "message",
          position: { x: 0, y: 0 },
          data: { label: "Привет", text: "Привет" },
        },
      ],
      edges: [{ id: "e0", source: "start", target: "hi", sourceHandle: "next" }],
    };

    const result = deterministicRepair(doc);
    expect(result.changed).toBe(false);
    expect(result.doc.edges).toHaveLength(1);
  });
});
