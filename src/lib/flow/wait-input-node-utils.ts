import type { WaitInputNodeData } from "@/lib/flow/flow-schema";
import { isValidVariableKey, normalizeVariableKey } from "@/lib/flow/variable-key-utils";

export const WAIT_INPUT_SOURCE_HANDLES = ["next"] as const;

export type WaitInputSourceHandle = (typeof WAIT_INPUT_SOURCE_HANDLES)[number];

export function normalizeWaitInputNodeData(raw: unknown): WaitInputNodeData {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const label = typeof data.label === "string" ? data.label : "Ожидание ввода";
  const variableKeyRaw =
    typeof data.variableKey === "string" ? normalizeVariableKey(data.variableKey) : "user_input";
  const variableKey = isValidVariableKey(variableKeyRaw) ? variableKeyRaw : "user_input";

  return {
    label,
    variableKey,
  };
}

export function isValidWaitInputSourceHandle(
  handleId: string | null | undefined,
): handleId is WaitInputSourceHandle {
  return handleId == null || handleId === "next";
}

export function buildWaitInputPreview(data: WaitInputNodeData): string {
  const key = normalizeVariableKey(data.variableKey);
  return `→ var.${key}`;
}
