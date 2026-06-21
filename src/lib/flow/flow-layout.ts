import type { FlowNode } from "@/lib/flow/flow-schema";
import { getMessageSourceHandles, normalizeMessageNodeData } from "@/lib/flow/message-node-utils";

export const FLOW_NODE_WIDTH_PX = 320;
export const FLOW_NODE_X = 48;
export const FLOW_NODE_Y = 80;
export const FLOW_NODE_X_GAP = 128;
export const FLOW_NODE_LANE_GAP = 96;
export const FLOW_NODE_BASE_HEIGHT = 72;
export const FLOW_NODE_MESSAGE_WITH_BUTTONS_HEIGHT = 152;

export const FLOW_NODE_CARD_CLASS = "w-[320px] py-0 shadow-sm transition-shadow";
export const FLOW_NODE_CONTENT_CLASS = "flex items-center gap-3 px-4 py-3";

export function streamNodeId(index: number): string {
  return `stream-node-${index}`;
}

export function buildRowNodePosition(index: number): { x: number; y: number } {
  return {
    x: FLOW_NODE_X + index * (FLOW_NODE_WIDTH_PX + FLOW_NODE_X_GAP),
    y: FLOW_NODE_Y,
  };
}

export function splitIntoTriggerLanes(nodes: FlowNode[]): FlowNode[][] {
  if (nodes.length === 0) {
    return [];
  }

  const lanes: FlowNode[][] = [];
  let currentLane: FlowNode[] = [];

  for (const node of nodes) {
    const startsNewLane =
      node.type === "trigger" &&
      (currentLane.some((item) => item.type === "trigger") ||
        (currentLane.length > 0 && !currentLane.some((item) => item.type === "trigger")));

    if (startsNewLane) {
      lanes.push(currentLane);
      currentLane = [node];
      continue;
    }

    currentLane.push(node);
  }

  if (currentLane.length > 0) {
    lanes.push(currentLane);
  }

  return lanes;
}

export function estimateNodeHeight(node: FlowNode): number {
  if (node.type === "message" && getBranchHandleOrder(node).length > 0) {
    return FLOW_NODE_MESSAGE_WITH_BUTTONS_HEIGHT;
  }

  if (node.type === "condition" || node.type === "http_request") {
    return FLOW_NODE_MESSAGE_WITH_BUTTONS_HEIGHT;
  }

  return FLOW_NODE_BASE_HEIGHT;
}

export function getBranchHandleOrder(node: FlowNode): string[] {
  if (node.type === "condition") {
    return ["yes", "no"];
  }

  if (node.type === "http_request") {
    return ["success", "error"];
  }

  if (node.type !== "message") {
    return [];
  }

  return getMessageSourceHandles(normalizeMessageNodeData(node.data))
    .map((handle) => handle.id)
    .filter((handleId) => handleId !== "next");
}
