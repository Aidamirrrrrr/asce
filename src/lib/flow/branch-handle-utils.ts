import { Position } from "@xyflow/react";

import type { FlowNode } from "@/lib/flow/flow-schema";
import { getMessageSourceHandles, normalizeMessageNodeData } from "@/lib/flow/message-node-utils";

export const FLOW_BUS_EDGE_TYPE = "flowBus";

const SECONDARY_BRANCH_LABEL_PATTERN = /отмен|cancel|вернут|назад|back|в меню/i;
const BACK_NAVIGATION_LABEL_PATTERN = /назад|back|в меню|вернут|↩/i;

export function isCancelBranchLabel(label: string): boolean {
  return /отмен|cancel/i.test(label);
}

/** Кнопка-«назад»: ведёт обратно к меню/предыдущему экрану. Линию для неё прячем. */
export function isBackNavigationLabel(label: string): boolean {
  return BACK_NAVIGATION_LABEL_PATTERN.test(label);
}

type BackNavNode = { id: string; type?: string; data: unknown };
type BackNavEdge = { id: string; source: string; target: string; sourceHandle?: string | null };

function getNodeShortLabel(node: BackNavNode | undefined): string {
  const label = (node?.data as { label?: unknown } | undefined)?.label;
  return typeof label === "string" ? label : "";
}

export type HandleSide = "left" | "right" | "top" | "bottom";

type GeoNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  measured?: { width?: number | null; height?: number | null } | null;
};

function nodeCenter(node: GeoNode): { cx: number; cy: number } {
  const width = node.measured?.width ?? node.width ?? 320;
  const height = node.measured?.height ?? node.height ?? 72;
  return { cx: node.position.x + width / 2, cy: node.position.y + height / 2 };
}

/** Сторона ноды-источника, обращённая к цели (по геометрии центров). */
function sideTowards(source: GeoNode, target: GeoNode): HandleSide {
  const a = nodeCenter(source);
  const b = nodeCenter(target);
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

/**
 * Для каждого исходящего хендла кнопки выбирает сторону коннектора, обращённую
 * к его цели, — чтобы линия шла в нужную сторону, а точки не пихались снизу.
 * Возвращает карту нода → { handleId: сторона }.
 */
export function computeSourceHandleSides(
  nodes: GeoNode[],
  edges: BackNavEdge[],
): Map<string, Record<string, HandleSide>> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const result = new Map<string, Record<string, HandleSide>>();

  for (const edge of edges) {
    const handleId = edge.sourceHandle;
    if (!(handleId && (handleId.startsWith("btn-") || handleId.startsWith("reply-")))) {
      continue;
    }

    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!(source && target) || source.type !== "message") {
      continue;
    }

    const sides = result.get(edge.source) ?? {};
    sides[handleId] = sideTowards(source, target);
    result.set(edge.source, sides);
  }

  return result;
}

/**
 * Находит рёбра кнопок-«назад» (по тексту кнопки) и собирает для них:
 * - id рёбер, которые на холсте рисуем ПУНКТИРОМ (чтобы возврат в меню не путали
 *   с обрывом схемы, но и не разводили спагетти);
 * - карту нод → { handleId: подпись цели }, чтобы показать «↩ → Меню» прямо на ноде.
 * Связь в данных остаётся — рантайм работает как прежде.
 */
export function computeBackNavigation(
  nodes: BackNavNode[],
  edges: BackNavEdge[],
): { backEdgeIds: Set<string>; backLinksByNode: Map<string, Record<string, string>> } {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const backEdgeIds = new Set<string>();
  const backLinksByNode = new Map<string, Record<string, string>>();

  for (const edge of edges) {
    const handleId = edge.sourceHandle;
    if (!(handleId && (handleId.startsWith("btn-") || handleId.startsWith("reply-")))) {
      continue;
    }

    const source = nodeById.get(edge.source);
    if (!source || source.type !== "message") {
      continue;
    }

    const handle = getMessageSourceHandles(normalizeMessageNodeData(source.data)).find(
      (item) => item.id === handleId,
    );
    if (!(handle && isBackNavigationLabel(handle.label))) {
      continue;
    }

    backEdgeIds.add(edge.id);
    const links = backLinksByNode.get(edge.source) ?? {};
    links[handleId] = getNodeShortLabel(nodeById.get(edge.target));
    backLinksByNode.set(edge.source, links);
  }

  return { backEdgeIds, backLinksByNode };
}

export function isSecondaryBranchLabel(label: string): boolean {
  return SECONDARY_BRANCH_LABEL_PATTERN.test(label);
}

export function isPrimaryBranchHandle(
  node: FlowNode,
  handleId: string | null | undefined,
): boolean {
  if (!handleId || handleId === "next") {
    return true;
  }

  if (node.type === "condition") {
    return handleId === "yes";
  }

  if (node.type === "http_request") {
    return handleId === "success";
  }

  if (node.type === "message") {
    const handles = getMessageSourceHandles(normalizeMessageNodeData(node.data)).filter(
      (handle) => handle.id !== "next",
    );

    if (handles.length === 2) {
      const secondary =
        handles.find((handle) => isSecondaryBranchLabel(handle.label)) ?? handles[1]!;
      return handleId !== secondary.id;
    }
  }

  return false;
}

export function getBranchSourcePosition(node: FlowNode, handleId: string): Position {
  return isPrimaryBranchHandle(node, handleId) ? Position.Right : Position.Bottom;
}

export function withFlowBusEdgeType<T extends { type?: string }>(edge: T): T & { type: string } {
  return {
    ...edge,
    type: edge.type ?? FLOW_BUS_EDGE_TYPE,
  };
}
