import dagre from "@dagrejs/dagre";

import { isBackNavigationLabel } from "@/lib/flow/branch-handle-utils";
import {
  estimateNodeHeight,
  FLOW_NODE_BASE_HEIGHT,
  FLOW_NODE_LANE_GAP,
  FLOW_NODE_WIDTH_PX,
  FLOW_NODE_X,
  FLOW_NODE_X_GAP,
  FLOW_NODE_Y,
  getBranchHandleOrder,
  splitIntoTriggerLanes,
} from "@/lib/flow/flow-layout";
import type { FlowEdge, FlowNode } from "@/lib/flow/flow-schema";
import { getMessageSourceHandles, normalizeMessageNodeData } from "@/lib/flow/message-node-utils";

type LayoutPosition = { x: number; y: number };

/** Вертикальный зазор между соседними ветками внутри одной дорожки. */
const LANE_NODE_SEP = 48;
const LANE_EDGE_SEP = 24;

function isBackNavigationEdge(edge: FlowEdge, nodeById: Map<string, FlowNode>): boolean {
  const handleId = edge.sourceHandle;
  if (!(handleId && (handleId.startsWith("btn-") || handleId.startsWith("reply-")))) {
    return false;
  }

  const source = nodeById.get(edge.source);
  if (source?.type !== "message") {
    return false;
  }

  const handle = getMessageSourceHandles(normalizeMessageNodeData(source.data)).find(
    (item) =>
      item.id === handleId ||
      (handleId && item.id === `btn-${handleId}`) ||
      (handleId?.startsWith("btn-") && item.id === handleId),
  );
  return Boolean(handle && isBackNavigationLabel(handle.label));
}

/** Рёбра «назад» не участвуют в раскладке — иначе dagre поднимает хвост потока вверх. */
function computeForwardDepths(triggerId: string, edges: FlowEdge[]): Map<string, number> {
  const depth = new Map<string, number>([[triggerId, 0]]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const edge of edges) {
      const sourceDepth = depth.get(edge.source);
      if (sourceDepth === undefined) {
        continue;
      }

      const nextDepth = sourceDepth + 1;
      const current = depth.get(edge.target);
      if (current === undefined || nextDepth < current) {
        depth.set(edge.target, nextDepth);
        changed = true;
      }
    }
  }

  return depth;
}

function filterLayoutEdges(lane: FlowNode[], laneEdges: FlowEdge[]): FlowEdge[] {
  const nodeById = new Map(lane.map((node) => [node.id, node]));
  const trigger = lane.find((node) => node.type === "trigger");
  const withoutBackLabels = laneEdges.filter((edge) => !isBackNavigationEdge(edge, nodeById));

  if (!trigger) {
    return withoutBackLabels;
  }

  const depth = computeForwardDepths(trigger.id, withoutBackLabels);
  return withoutBackLabels.filter((edge) => {
    const sourceDepth = depth.get(edge.source);
    const targetDepth = depth.get(edge.target);
    if (sourceDepth === undefined || targetDepth === undefined) {
      return true;
    }

    // Переход к уже пройденному узлу — «назад», не влияет на раскладку.
    return targetDepth >= sourceDepth;
  });
}

/**
 * Вытягивает последовательные участки A→B→C на одну горизонталь (один вход / один выход).
 * Ветвления и слияния не трогаем.
 */
function straightenLinearChains(
  layoutEdges: FlowEdge[],
  positions: Map<string, LayoutPosition>,
): void {
  if (layoutEdges.length === 0) {
    return;
  }

  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const edge of layoutEdges) {
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  for (let pass = 0; pass < layoutEdges.length; pass += 1) {
    let changed = false;

    for (const edge of layoutEdges) {
      if ((outgoing.get(edge.source) ?? 0) !== 1 || (incoming.get(edge.target) ?? 0) !== 1) {
        continue;
      }

      const sourcePos = positions.get(edge.source);
      const targetPos = positions.get(edge.target);
      if (!(sourcePos && targetPos) || targetPos.x <= sourcePos.x) {
        continue;
      }

      if (targetPos.y !== sourcePos.y) {
        positions.set(edge.target, { x: targetPos.x, y: sourcePos.y });
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }
}

function handlesMatch(edgeHandle: string, orderHandle: string): boolean {
  return (
    edgeHandle === orderHandle ||
    edgeHandle === `btn-${orderHandle}` ||
    orderHandle === `btn-${edgeHandle}` ||
    edgeHandle.replace(/^btn-/, "") === orderHandle.replace(/^btn-/, "")
  );
}

function handleOrderIndex(handleOrder: string[], sourceHandle: string | null | undefined): number {
  if (!sourceHandle) {
    return -1;
  }

  return handleOrder.findIndex((handleId) => handlesMatch(sourceHandle, handleId));
}

function estimateHandleAnchorY(
  source: FlowNode,
  handleIndex: number,
  handleCount: number,
  sourcePos: LayoutPosition,
): number {
  const sourceHeight = estimateNodeHeight(source);
  const fraction = handleCount === 1 ? 0.5 : (handleIndex + 1) / (handleCount + 1);
  const cardHeight =
    source.type === "message" && handleCount > 0
      ? Math.max(FLOW_NODE_BASE_HEIGHT, sourceHeight - 32)
      : sourceHeight;
  return sourcePos.y + cardHeight * fraction;
}

type NodeBounds = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function getNodeBounds(
  nodeId: string,
  nodeById: Map<string, FlowNode>,
  positions: Map<string, LayoutPosition>,
): NodeBounds | null {
  const node = nodeById.get(nodeId);
  const position = positions.get(nodeId);
  if (!(node && position)) {
    return null;
  }

  return {
    id: nodeId,
    x: position.x,
    y: position.y,
    width: FLOW_NODE_WIDTH_PX,
    height: estimateNodeHeight(node),
  };
}

function boundsOverlap(left: NodeBounds, right: NodeBounds, gap = LANE_NODE_SEP / 2): boolean {
  if (left.x + left.width + gap <= right.x || right.x + right.width + gap <= left.x) {
    return false;
  }
  return !(left.y + left.height + gap <= right.y || right.y + right.height + gap <= left.y);
}

/** Сдвигаем узлы вниз, пока bounding-box'ы не перестанут пересекаться. */
function resolveNodeOverlaps(
  lane: FlowNode[],
  positions: Map<string, LayoutPosition>,
  nodeById: Map<string, FlowNode>,
): void {
  const ids = lane.map((node) => node.id);

  for (let iteration = 0; iteration < ids.length * 8; iteration += 1) {
    let changed = false;

    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const leftId = ids[leftIndex]!;
        const rightId = ids[rightIndex]!;
        const left = getNodeBounds(leftId, nodeById, positions);
        const right = getNodeBounds(rightId, nodeById, positions);
        if (!(left && right && boundsOverlap(left, right))) {
          continue;
        }

        const moveId = left.y <= right.y ? rightId : leftId;
        const stationary = moveId === leftId ? right : left;
        const movingPos = positions.get(moveId)!;
        const nextY = stationary.y + stationary.height + LANE_NODE_SEP / 2;

        if (movingPos.y < nextY) {
          positions.set(moveId, { x: movingPos.x, y: nextY });
          changed = true;
        }
      }
    }

    if (!changed) {
      break;
    }
  }
}

function compactColumnOverlaps(lane: FlowNode[], positions: Map<string, LayoutPosition>): void {
  const columnKey = (x: number) => Math.round(x / (FLOW_NODE_WIDTH_PX + FLOW_NODE_X_GAP));
  const byColumn = new Map<number, Array<{ id: string; y: number; height: number }>>();

  for (const node of lane) {
    const position = positions.get(node.id);
    if (!position) {
      continue;
    }
    const column = columnKey(position.x);
    const entries = byColumn.get(column) ?? [];
    entries.push({ id: node.id, y: position.y, height: estimateNodeHeight(node) });
    byColumn.set(column, entries);
  }

  for (const entries of byColumn.values()) {
    entries.sort((left, right) => left.y - right.y);
    let cursor = entries[0]?.y ?? 0;
    for (const entry of entries) {
      const nextY = Math.max(entry.y, cursor);
      const position = positions.get(entry.id);
      if (position) {
        positions.set(entry.id, { x: position.x, y: nextY });
      }
      cursor = nextY + entry.height + LANE_NODE_SEP;
    }
  }
}

/**
 * Целевые узлы веток ставим на уровень соответствующих кнопок родителя —
 * линии идут горизонтально, без перекрёста с соседними экранами.
 */
function positionBranchTargetsByParent(
  lane: FlowNode[],
  layoutEdges: FlowEdge[],
  positions: Map<string, LayoutPosition>,
): void {
  const nodeById = new Map(lane.map((node) => [node.id, node]));

  for (const source of lane) {
    const handleOrder = getBranchHandleOrder(source).filter((handleId) => handleId !== "next");
    const sourcePos = positions.get(source.id);
    if (!sourcePos || handleOrder.length === 0) {
      continue;
    }

    const branchEdges = layoutEdges.filter((edge) => {
      if (edge.source !== source.id) {
        return false;
      }
      return handleOrderIndex(handleOrder, edge.sourceHandle) >= 0;
    });

    if (branchEdges.length === 0) {
      continue;
    }

    const orderedEdges = [...branchEdges].sort(
      (left, right) =>
        handleOrderIndex(handleOrder, left.sourceHandle) -
        handleOrderIndex(handleOrder, right.sourceHandle),
    );

    if (orderedEdges.length === 1) {
      const edge = orderedEdges[0]!;
      const target = nodeById.get(edge.target);
      const targetPos = positions.get(edge.target);
      if (!(target && targetPos)) {
        continue;
      }

      const sourceHeight = estimateNodeHeight(source);
      const targetHeight = estimateNodeHeight(target);
      const handleIdx = Math.max(0, handleOrderIndex(handleOrder, edge.sourceHandle));
      const anchorY =
        handleOrder.length === 1
          ? sourcePos.y + sourceHeight / 2
          : estimateHandleAnchorY(source, handleIdx, handleOrder.length, sourcePos);

      positions.set(edge.target, {
        x: targetPos.x,
        y: anchorY - targetHeight / 2,
      });
      continue;
    }

    const targetIds = orderedEdges.map((edge) => edge.target);
    if (new Set(targetIds).size !== targetIds.length) {
      continue;
    }

    for (const edge of orderedEdges) {
      const handleIdx = handleOrderIndex(handleOrder, edge.sourceHandle);
      const target = nodeById.get(edge.target);
      const targetPos = positions.get(edge.target);
      if (handleIdx < 0 || !(target && targetPos)) {
        continue;
      }

      const anchorY = estimateHandleAnchorY(source, handleIdx, handleOrder.length, sourcePos);
      const targetHeight = estimateNodeHeight(target);
      positions.set(edge.target, {
        x: targetPos.x,
        y: anchorY - targetHeight / 2,
      });
    }
  }

  compactColumnOverlaps(lane, positions);
  resolveNodeOverlaps(lane, positions, nodeById);
}

/**
 * Раскладывает одну дорожку (поток одного триггера) деревом слева-направо
 * силами dagre. Никакой ручной доводки — позиции берём как есть и сдвигаем
 * всю дорожку так, чтобы её левый-верхний угол попал в (FLOW_NODE_X, laneY).
 */
function layoutLane(
  lane: FlowNode[],
  laneEdges: FlowEdge[],
  laneY: number,
): { positions: Map<string, LayoutPosition>; height: number } {
  const layoutEdges = filterLayoutEdges(lane, laneEdges);
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    nodesep: LANE_NODE_SEP,
    edgesep: LANE_EDGE_SEP,
    // В LR ranksep — зазор между колонками по горизонтали (от края до края),
    // ширина узла учитывается отдельно.
    ranksep: FLOW_NODE_X_GAP,
    acyclicer: "greedy",
    marginx: 0,
    marginy: 0,
  });

  for (const node of lane) {
    graph.setNode(node.id, {
      width: FLOW_NODE_WIDTH_PX,
      height: estimateNodeHeight(node),
    });
  }

  for (const edge of layoutEdges) {
    graph.setEdge(
      { v: edge.source, w: edge.target, name: edge.id },
      // Основную ветку (кнопки) держим прямее, чтобы спина потока шла по прямой,
      // а второстепенные переходы расходились.
      { minlen: 1, weight: edge.sourceHandle?.startsWith("btn-") ? 2 : 1 },
    );
  }

  dagre.layout(graph);

  const positions = new Map<string, LayoutPosition>();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of lane) {
    const laidOut = graph.node(node.id) as { x: number; y: number } | undefined;
    if (!laidOut) {
      continue;
    }

    const height = estimateNodeHeight(node);
    const position = {
      x: laidOut.x - FLOW_NODE_WIDTH_PX / 2,
      y: laidOut.y - height / 2,
    };
    positions.set(node.id, position);
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y + height);
  }

  positionBranchTargetsByParent(lane, layoutEdges, positions);
  straightenLinearChains(layoutEdges, positions);

  if (!Number.isFinite(minX)) {
    return { positions, height: 0 };
  }

  // Пересчитываем границы после выравнивания.
  minY = Number.POSITIVE_INFINITY;
  maxY = Number.NEGATIVE_INFINITY;
  for (const node of lane) {
    const position = positions.get(node.id);
    if (!position) {
      continue;
    }
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y + estimateNodeHeight(node));
  }

  const offsetX = FLOW_NODE_X - minX;
  const offsetY = laneY - minY;
  for (const [id, position] of positions) {
    positions.set(id, { x: position.x + offsetX, y: position.y + offsetY });
  }

  return { positions, height: maxY - minY };
}

/**
 * Единый алгоритм раскладки графа: дерево слева-направо через dagre.
 * Каждый триггер — отдельная дорожка, дорожки складываются друг под другом.
 */
export function buildDagreNodePositions(
  nodes: FlowNode[],
  edges: FlowEdge[],
): Map<string, LayoutPosition> {
  const lanes = splitIntoTriggerLanes(nodes);
  const positions = new Map<string, LayoutPosition>();
  let laneY = FLOW_NODE_Y;

  for (const lane of lanes) {
    const laneNodeIds = new Set(lane.map((node) => node.id));
    const laneEdges = edges.filter(
      (edge) => laneNodeIds.has(edge.source) && laneNodeIds.has(edge.target),
    );

    const { positions: lanePositions, height } = layoutLane(lane, laneEdges, laneY);
    for (const [id, position] of lanePositions) {
      positions.set(id, position);
    }

    laneY += height + FLOW_NODE_LANE_GAP;
  }

  // Подстраховка: узлы, которых dagre не разместил (изолированные), ставим столбиком.
  for (const node of nodes) {
    if (positions.has(node.id)) {
      continue;
    }
    positions.set(node.id, { x: FLOW_NODE_X, y: laneY });
    laneY += estimateNodeHeight(node) + FLOW_NODE_LANE_GAP;
  }

  return positions;
}
