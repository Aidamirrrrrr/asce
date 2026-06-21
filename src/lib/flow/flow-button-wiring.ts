import { normalizeConditionNodeData } from "@/lib/flow/condition-node-utils";
import type { FlowEdge, FlowNode, TriggerNodeData } from "@/lib/flow/flow-schema";
import { getMessageSourceHandles, normalizeMessageNodeData } from "@/lib/flow/message-node-utils";

const SUBSCRIPTION_RECHECK_BUTTON_PATTERN = /подпис|провер/i;

export function normalizeBranchLabel(value: string): string {
  return foldLatinHomoglyphsToCyrillic(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Латинские «двойники» кириллицы (частая ошибка LLM: Mужская вместо Мужская). */
function foldLatinHomoglyphsToCyrillic(value: string): string {
  const map: Record<string, string> = {
    A: "А",
    a: "а",
    B: "В",
    C: "С",
    c: "с",
    E: "Е",
    e: "е",
    H: "Н",
    K: "К",
    M: "М",
    m: "м",
    O: "О",
    o: "о",
    P: "Р",
    p: "р",
    T: "Т",
    X: "Х",
    x: "х",
    Y: "У",
    y: "у",
  };

  return [...value].map((char) => map[char] ?? char).join("");
}

export function buttonLabelMatches(buttonLabel: string, nodeLabel: string): boolean {
  const button = normalizeBranchLabel(buttonLabel);
  const node = normalizeBranchLabel(nodeLabel);
  if (!(button && node)) {
    return false;
  }

  if (button === node) {
    return true;
  }

  if (button.length >= 4 && node.startsWith(button)) {
    return true;
  }

  if (node.length >= 4 && button.startsWith(node)) {
    return true;
  }

  if (button.length >= 6 && node.includes(button)) {
    return true;
  }

  return node.length >= 6 && button.includes(node);
}

function getNodeLabel(node: FlowNode): string {
  const data = node.data;
  if (data && typeof data === "object" && "label" in data && typeof data.label === "string") {
    return data.label;
  }
  return node.id;
}

export function getBranchableMessageHandles(node: FlowNode): Array<{ id: string; label: string }> {
  if (node.type !== "message") {
    return [];
  }

  return getMessageSourceHandles(normalizeMessageNodeData(node.data)).filter(
    (handle) => handle.id !== "next",
  );
}

function isBranchSourceHandle(sourceHandle: string | null | undefined): boolean {
  if (!sourceHandle) {
    return false;
  }

  return (
    sourceHandle.startsWith("btn-") ||
    sourceHandle.startsWith("reply-") ||
    sourceHandle === "yes" ||
    sourceHandle === "no" ||
    sourceHandle === "success" ||
    sourceHandle === "error"
  );
}

function findMenuReturnTarget(nodes: FlowNode[], usedTargets: Set<string>): FlowNode | undefined {
  for (const candidate of nodes) {
    if (usedTargets.has(candidate.id) || candidate.type !== "message") {
      continue;
    }

    const label = normalizeBranchLabel(getNodeLabel(candidate));
    if (/главн.*меню|^меню$|старт.*меню/i.test(label)) {
      return candidate;
    }
  }

  const startIndex = nodes.findIndex(
    (node) =>
      node.type === "trigger" && (node.data as TriggerNodeData).command?.trim() === "/start",
  );

  if (startIndex >= 0) {
    const menuCandidate = nodes[startIndex + 1];
    if (menuCandidate?.type === "message" && !usedTargets.has(menuCandidate.id)) {
      return menuCandidate;
    }
  }

  return undefined;
}

function findPrecedingChatMemberCondition(
  nodes: FlowNode[],
  sourceIndex: number,
): FlowNode | undefined {
  for (let index = sourceIndex - 1; index >= 0; index--) {
    const candidate = nodes[index]!;
    if (candidate.type !== "condition") {
      continue;
    }

    const data = normalizeConditionNodeData(candidate.data);
    if (data.rules.some((rule) => rule.type === "chat_member")) {
      return candidate;
    }
  }

  return undefined;
}

export function findBestButtonTarget(
  nodes: FlowNode[],
  sourceIndex: number,
  buttonLabel: string,
  usedTargets: Set<string>,
): FlowNode | undefined {
  for (let index = 0; index < nodes.length; index++) {
    if (index === sourceIndex) {
      continue;
    }

    const candidate = nodes[index]!;
    if (usedTargets.has(candidate.id)) {
      continue;
    }

    if (buttonLabelMatches(buttonLabel, getNodeLabel(candidate))) {
      return candidate;
    }
  }

  const normalizedButton = normalizeBranchLabel(buttonLabel);
  if (/меню|назад|вернуть|отмен/i.test(normalizedButton)) {
    const menuTarget = findMenuReturnTarget(nodes, usedTargets);
    if (menuTarget) {
      return menuTarget;
    }
  }

  if (SUBSCRIPTION_RECHECK_BUTTON_PATTERN.test(normalizedButton)) {
    const recheckTarget = findPrecedingChatMemberCondition(nodes, sourceIndex);
    if (recheckTarget && !usedTargets.has(recheckTarget.id)) {
      return recheckTarget;
    }
  }

  for (let index = sourceIndex + 1; index < nodes.length; index++) {
    const candidate = nodes[index]!;
    if (!usedTargets.has(candidate.id)) {
      return candidate;
    }
  }

  return undefined;
}

export type UnwiredButtonIssue = {
  sourceId: string;
  sourceLabel: string;
  handleId: string;
  buttonLabel: string;
};

export function findUnwiredBranchButtons(
  nodes: FlowNode[],
  edges: FlowEdge[],
): UnwiredButtonIssue[] {
  const wired = new Set(
    edges
      .filter((edge) => isBranchSourceHandle(edge.sourceHandle))
      .map((edge) => `${edge.source}:${edge.sourceHandle}`),
  );

  const issues: UnwiredButtonIssue[] = [];

  for (const node of nodes) {
    if (node.type !== "message") {
      continue;
    }

    for (const handle of getBranchableMessageHandles(node)) {
      if (wired.has(`${node.id}:${handle.id}`)) {
        continue;
      }

      issues.push({
        sourceId: node.id,
        sourceLabel: getNodeLabel(node),
        handleId: handle.id,
        buttonLabel: handle.label,
      });
    }
  }

  return issues;
}

export function repairMessageButtonEdges(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  const filtered = edges.filter((edge) => {
    if (!edge.sourceHandle?.startsWith("btn-")) {
      return true;
    }

    const sourceIndex = nodes.findIndex((node) => node.id === edge.source);
    if (sourceIndex < 0) {
      return true;
    }

    const sourceNode = nodes[sourceIndex]!;
    if (sourceNode.type !== "message") {
      return true;
    }

    const handle = getBranchableMessageHandles(sourceNode).find(
      (item) => item.id === edge.sourceHandle,
    );
    if (!(handle && SUBSCRIPTION_RECHECK_BUTTON_PATTERN.test(normalizeBranchLabel(handle.label)))) {
      return true;
    }

    const recheckTarget = findPrecedingChatMemberCondition(nodes, sourceIndex);
    if (!recheckTarget) {
      return true;
    }

    return edge.target === recheckTarget.id;
  });

  const result = [...filtered];
  const wired = new Set(
    result
      .filter((edge) => isBranchSourceHandle(edge.sourceHandle))
      .map((edge) => `${edge.source}:${edge.sourceHandle}`),
  );

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.type !== "message") {
      continue;
    }

    const usedTargets = new Set(
      result
        .filter((edge) => edge.source === node.id && isBranchSourceHandle(edge.sourceHandle))
        .map((edge) => edge.target),
    );

    for (const handle of getBranchableMessageHandles(node)) {
      const key = `${node.id}:${handle.id}`;
      if (wired.has(key)) {
        continue;
      }

      const target = findBestButtonTarget(nodes, index, handle.label, usedTargets);
      if (!target) {
        continue;
      }

      result.push({
        id: `e-${node.id}-${handle.id}-${target.id}`,
        source: node.id,
        target: target.id,
        sourceHandle: handle.id,
      });
      wired.add(key);
      usedTargets.add(target.id);
    }
  }

  return result;
}
