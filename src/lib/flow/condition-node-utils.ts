import type {
  ConditionNodeData,
  ConditionRule,
  FlowNode,
  MessageNodeData,
} from "@/lib/flow/flow-schema";
import {
  isValidMessageSourceHandle,
  normalizeMessageNodeData,
} from "@/lib/flow/message-node-utils";

export const CONDITION_SOURCE_HANDLES = ["yes", "no"] as const;

export type ConditionSourceHandle = (typeof CONDITION_SOURCE_HANDLES)[number];

export function createConditionRuleId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function normalizeConditionNodeData(raw: unknown): ConditionNodeData {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const label = typeof data.label === "string" ? data.label : "Условие";
  const matchMode = data.matchMode === "any" ? "any" : "all";
  const rules = normalizeConditionRules(data.rules);

  return {
    label,
    matchMode,
    rules,
  };
}

function normalizeConditionRules(raw: unknown): ConditionRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => normalizeConditionRule(item))
    .filter((rule): rule is ConditionRule => rule !== null);
}

function normalizeConditionRule(raw: unknown): ConditionRule | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const rule = raw as Partial<ConditionRule> & Record<string, unknown>;
  const id = typeof rule.id === "string" && rule.id ? rule.id : createConditionRuleId();

  if (rule.type === "chat_member") {
    const chatIds = Array.isArray(rule.chatIds)
      ? rule.chatIds
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [];

    if (chatIds.length === 0) {
      return null;
    }

    return {
      id,
      type: "chat_member",
      chatIds,
      chatMatchMode: rule.chatMatchMode === "any" ? "any" : "all",
    };
  }

  if (rule.type === "is_premium") {
    return {
      id,
      type: "is_premium",
      expected: rule.expected !== false,
    };
  }

  if (rule.type === "has_username") {
    return {
      id,
      type: "has_username",
      expected: rule.expected !== false,
    };
  }

  if (rule.type === "start_param") {
    const value = typeof rule.value === "string" ? rule.value.trim() : "";
    if (!value) {
      return null;
    }

    return {
      id,
      type: "start_param",
      operator: rule.operator === "contains" ? "contains" : "equals",
      value,
    };
  }

  return null;
}

export function isValidConditionSourceHandle(
  handleId: string | null | undefined,
): handleId is ConditionSourceHandle {
  return handleId === "yes" || handleId === "no";
}

export function isValidSourceHandle(node: FlowNode, handleId: string | null | undefined): boolean {
  if (node.type === "condition") {
    return isValidConditionSourceHandle(handleId);
  }

  if (node.type === "http_request") {
    return handleId === "success" || handleId === "error";
  }

  if (node.type === "set_variable") {
    return handleId == null || handleId === "next";
  }

  if (node.type === "wait_input") {
    return handleId == null || handleId === "next";
  }

  if (node.type === "message") {
    return isValidMessageSourceHandle(
      normalizeMessageNodeData(node.data as MessageNodeData),
      handleId,
    );
  }

  return handleId == null || handleId === "next";
}

export function buildConditionPreview(data: ConditionNodeData): string {
  if (data.rules.length === 0) {
    return "Правила не заданы";
  }

  const parts = data.rules.map((rule) => {
    switch (rule.type) {
      case "chat_member":
        return rule.chatMatchMode === "any"
          ? `подписка: любой из ${rule.chatIds.length}`
          : `подписка: все ${rule.chatIds.length}`;
      case "is_premium":
        return rule.expected ? "Premium" : "не Premium";
      case "has_username":
        return rule.expected ? "есть @username" : "нет @username";
      case "start_param":
        return `start: ${rule.value}`;
      default:
        return "правило";
    }
  });

  const joiner = data.matchMode === "any" ? " или " : " и ";
  return parts.join(joiner);
}
