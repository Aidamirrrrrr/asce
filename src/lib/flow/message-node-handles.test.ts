import { describe, expect, it } from "vitest";

import { sanitizeFlowDocument } from "@/lib/flow/flow-schema";
import { getMessageSourceHandles } from "@/lib/flow/message-node-utils";

describe("getMessageSourceHandles", () => {
  it("omits next when inline callback buttons exist", () => {
    const handles = getMessageSourceHandles({
      label: "Меню",
      text: "Выберите",
      keyboard: {
        type: "inline",
        rows: [[{ id: "b1", text: "Продукты", kind: "callback" }]],
      },
    });

    expect(handles.map((handle) => handle.id)).toEqual(["btn-b1"]);
  });

  it("keeps next for linear messages without branch buttons", () => {
    const handles = getMessageSourceHandles({
      label: "Приветствие",
      text: "Привет",
    });

    expect(handles.map((handle) => handle.id)).toEqual(["next"]);
  });
});

describe("sanitizeFlowDocument", () => {
  it("drops invalid next edges from keyboard menus", () => {
    const sanitized = sanitizeFlowDocument({
      nodes: [
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
        { id: "e-next", source: "menu", target: "branch", sourceHandle: "next" },
        { id: "e-btn", source: "menu", target: "branch", sourceHandle: "btn-b1" },
      ],
    });

    expect(sanitized.edges).toEqual([
      { id: "e-btn", source: "menu", target: "branch", sourceHandle: "btn-b1" },
    ]);
  });
});
