import { describe, expect, it } from "vitest";

import { buildDagreNodePositions } from "@/lib/flow/flow-dagre-layout";
import { estimateNodeHeight } from "@/lib/flow/flow-layout";
import {
  createDefaultNodeData,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
} from "@/lib/flow/flow-schema";
import { normalizeMessageNodeData } from "@/lib/flow/message-node-utils";

function node(id: string, type: FlowNodeType): FlowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: createDefaultNodeData(type),
  };
}

function edge(source: string, target: string, sourceHandle = "next"): FlowEdge {
  return { id: `e-${source}-${target}`, source, target, sourceHandle };
}

describe("buildDagreNodePositions", () => {
  it("lays out a linear chain left-to-right without overlaps", () => {
    const nodes = [node("t1", "trigger"), node("m1", "message"), node("m2", "message")];
    const edges = [edge("t1", "m1"), edge("m1", "m2")];

    const positions = buildDagreNodePositions(nodes, edges);

    expect(positions.size).toBe(3);
    const t1 = positions.get("t1")!;
    const m1 = positions.get("m1")!;
    const m2 = positions.get("m2")!;
    expect(m1.x).toBeGreaterThan(t1.x);
    expect(m2.x).toBeGreaterThan(m1.x);
    expect(Math.abs(m1.y - t1.y)).toBeLessThan(estimateNodeHeight(nodes[1]!));
    expect(Math.abs(m2.y - m1.y)).toBeLessThan(4);
  });

  it("keeps linear tail on one line when a back-to-menu edge exists", () => {
    const menu = normalizeMessageNodeData({
      label: "Меню",
      text: "Меню",
      parseMode: "HTML",
      keyboard: {
        type: "inline",
        rows: [[{ id: "btn-book", text: "Записаться", type: "callback" }]],
      },
    });
    const confirm = normalizeMessageNodeData({
      label: "Подтверждение",
      text: "Готово",
      parseMode: "HTML",
      keyboard: {
        type: "inline",
        rows: [[{ id: "btn-back", text: "В меню", type: "callback" }]],
      },
    });

    const nodes: FlowNode[] = [
      node("t1", "trigger"),
      { id: "menu", type: "message", position: { x: 0, y: 0 }, data: menu },
      node("save", "save_record"),
      node("admin", "message"),
      { id: "confirm", type: "message", position: { x: 0, y: 0 }, data: confirm },
    ];
    const edges: FlowEdge[] = [
      edge("t1", "menu"),
      edge("menu", "save", "btn-book"),
      edge("save", "admin"),
      edge("admin", "confirm"),
      { id: "e-back", source: "confirm", target: "menu", sourceHandle: "btn-back" },
    ];

    const positions = buildDagreNodePositions(nodes, edges);
    const save = positions.get("save")!;
    const admin = positions.get("admin")!;
    const confirmPos = positions.get("confirm")!;

    expect(admin.x).toBeGreaterThan(save.x);
    expect(confirmPos.x).toBeGreaterThan(admin.x);
    expect(Math.abs(admin.y - save.y)).toBeLessThan(4);
    expect(Math.abs(confirmPos.y - admin.y)).toBeLessThan(4);
  });

  it("orders branch targets vertically to match button order on the screen", () => {
    const days = [
      "Понедельник",
      "Вторник",
      "Среда",
      "Четверг",
      "Пятница",
      "Суббота",
      "Воскресенье",
    ];
    const dayMenu = normalizeMessageNodeData({
      label: "Выбор дня",
      text: "Выберите день",
      parseMode: "HTML",
      keyboard: {
        type: "inline",
        rows: days.map((day) => [{ id: day.toLowerCase(), text: day, type: "callback" as const }]),
      },
    });
    const handles = days.map((day) => `btn-${day.toLowerCase()}`);

    const nodes: FlowNode[] = [
      node("t1", "trigger"),
      { id: "days", type: "message", position: { x: 0, y: 0 }, data: dayMenu },
      ...days.map((day) => node(`set-${day}`, "set_variable")),
      node("name", "message"),
    ];
    const edges: FlowEdge[] = [
      edge("t1", "days"),
      ...days.map((day, index) => edge("days", `set-${day}`, handles[index]!)),
      ...days.map((day) => edge(`set-${day}`, "name")),
    ];

    const positions = buildDagreNodePositions(nodes, edges);
    const dayYs = days.map((day) => positions.get(`set-${day}`)!.y);

    for (let index = 1; index < dayYs.length; index += 1) {
      expect(dayYs[index]!).toBeGreaterThan(dayYs[index - 1]!);
    }
  });

  it("aligns branch children with parent button anchors beside sibling screens", () => {
    const services = ["Стрижка", "Борода", "Комплекс"];
    const serviceMenu = normalizeMessageNodeData({
      label: "Выбор услуги",
      text: "Услуга?",
      parseMode: "HTML",
      keyboard: {
        type: "inline",
        rows: services.map((service) => [
          { id: service.toLowerCase(), text: service, type: "callback" as const },
        ]),
      },
    });
    const mainMenu = normalizeMessageNodeData({
      label: "Меню",
      text: "Меню",
      parseMode: "HTML",
      keyboard: {
        type: "inline",
        rows: [
          [{ id: "book", text: "Записаться", type: "callback" as const }],
          [{ id: "prices", text: "Цены", type: "callback" as const }],
          [{ id: "contacts", text: "Контакты", type: "callback" as const }],
        ],
      },
    });

    const nodes: FlowNode[] = [
      node("t1", "trigger"),
      { id: "menu", type: "message", position: { x: 0, y: 0 }, data: mainMenu },
      { id: "services", type: "message", position: { x: 0, y: 0 }, data: serviceMenu },
      node("prices", "message"),
      node("contacts", "message"),
      ...services.map((service) => node(`set-${service}`, "set_variable")),
    ];
    const edges: FlowEdge[] = [
      edge("t1", "menu"),
      edge("menu", "services", "btn-book"),
      edge("menu", "prices", "btn-prices"),
      edge("menu", "contacts", "btn-contacts"),
      ...services.map((service) =>
        edge("services", `set-${service}`, `btn-${service.toLowerCase()}`),
      ),
    ];

    const positions = buildDagreNodePositions(nodes, edges);
    const servicesPos = positions.get("services")!;
    const serviceYs = services.map((service) => positions.get(`set-${service}`)!.y);
    const pricesY = positions.get("prices")!.y;
    const contactsY = positions.get("contacts")!.y;

    expect(servicesPos.x).toBe(positions.get("prices")!.x);
    expect(pricesY).toBeLessThan(contactsY);

    for (let index = 1; index < serviceYs.length; index += 1) {
      expect(serviceYs[index]!).toBeGreaterThan(serviceYs[index - 1]!);
    }

    expect(Math.abs(serviceYs[0]! - servicesPos.y)).toBeLessThan(96);

    const bounds = nodes
      .map((item) => {
        const position = positions.get(item.id);
        if (!position) {
          return null;
        }
        return {
          id: item.id,
          x: position.x,
          y: position.y,
          height: estimateNodeHeight(item),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    for (let leftIndex = 0; leftIndex < bounds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < bounds.length; rightIndex += 1) {
        const left = bounds[leftIndex]!;
        const right = bounds[rightIndex]!;
        const gap = 24;
        const xOverlap = left.x + 320 + gap > right.x && right.x + 320 + gap > left.x;
        const yOverlap =
          left.y + left.height + gap > right.y && right.y + right.height + gap > left.y;
        expect(xOverlap && yOverlap).toBe(false);
      }
    }
  });
});
