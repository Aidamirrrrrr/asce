import type { SetVariableNodeData, SetVariableValueSource } from "@/lib/flow/flow-schema";
import { isValidVariableKey, normalizeVariableKey } from "@/lib/flow/variable-key-utils";
import { stripTextEmojisOptional } from "@/lib/text/strip-emojis";

export { isValidVariableKey, normalizeVariableKey };

export const SET_VARIABLE_SOURCE_HANDLES = ["next"] as const;

export type SetVariableSourceHandle = (typeof SET_VARIABLE_SOURCE_HANDLES)[number];

function normalizeValueSource(raw: unknown): SetVariableValueSource {
  if (raw === "user_message" || raw === "template") {
    return raw;
  }

  return "literal";
}

export function normalizeSetVariableNodeData(raw: unknown): SetVariableNodeData {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const label = typeof data.label === "string" ? data.label : "Переменная";
  const variableKeyRaw =
    typeof data.variableKey === "string" ? normalizeVariableKey(data.variableKey) : "my_var";
  const variableKey = isValidVariableKey(variableKeyRaw) ? variableKeyRaw : "my_var";
  const valueSource = normalizeValueSource(data.valueSource);
  const value = typeof data.value === "string" ? (stripTextEmojisOptional(data.value) ?? "") : "";

  return {
    label,
    variableKey,
    valueSource,
    ...(valueSource !== "user_message" ? { value } : {}),
  };
}

export function isValidSetVariableSourceHandle(
  handleId: string | null | undefined,
): handleId is SetVariableSourceHandle {
  return handleId == null || handleId === "next";
}

export function buildSetVariablePreview(data: SetVariableNodeData): string {
  const key = normalizeVariableKey(data.variableKey);

  switch (data.valueSource) {
    case "user_message":
      return `var.${key} из сообщения`;
    case "template":
      return `var.${key} из шаблона`;
    default:
      return `var.${key} = ${data.value?.trim() || "..."}`;
  }
}

export function resolveSetVariableValue(
  data: SetVariableNodeData,
  userMessage: string,
  _vars: Record<string, string>,
  interpolate: (text: string) => string,
): string {
  switch (data.valueSource) {
    case "user_message":
      return userMessage;
    case "template":
      return interpolate(data.value ?? "");
    default:
      return data.value ?? "";
  }
}

export function collectDeclaredVariableKeys(
  nodes: Array<{ type?: string; data?: unknown }>,
  declarations: Array<{ key: string }> = [],
): string[] {
  const keys = new Set<string>();

  for (const declaration of declarations) {
    const key = normalizeVariableKey(declaration.key);
    if (isValidVariableKey(key)) {
      keys.add(key);
    }
  }

  for (const node of nodes) {
    if (node.type === "set_variable" && node.data && typeof node.data === "object") {
      const variableKey = (node.data as SetVariableNodeData).variableKey;
      const key = normalizeVariableKey(variableKey);
      if (isValidVariableKey(key)) {
        keys.add(key);
      }
    }

    if (node.type === "wait_input" && node.data && typeof node.data === "object") {
      const variableKey = (node.data as { variableKey?: string }).variableKey;
      const key = normalizeVariableKey(variableKey ?? "");
      if (isValidVariableKey(key)) {
        keys.add(key);
      }
    }

    if (node.type === "http_request" && node.data && typeof node.data === "object") {
      const data = node.data as {
        responseVariable?: string;
        responseStatusVariable?: string;
      };
      for (const candidate of [data.responseVariable, data.responseStatusVariable]) {
        if (!candidate) {
          continue;
        }
        const key = normalizeVariableKey(candidate);
        if (isValidVariableKey(key)) {
          keys.add(key);
        }
      }
    }

    if (node.type === "json_extract" && node.data && typeof node.data === "object") {
      const variableKey = (node.data as { targetVariable?: string }).targetVariable;
      const key = normalizeVariableKey(variableKey ?? "");
      if (isValidVariableKey(key)) {
        keys.add(key);
      }
    }
  }

  return [...keys].sort();
}
