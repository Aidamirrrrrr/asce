import type { JsonExtractNodeData } from "@/lib/flow/flow-schema";
import { isValidVariableKey, normalizeVariableKey } from "@/lib/flow/variable-key-utils";

export const JSON_EXTRACT_SOURCE_HANDLES = ["next"] as const;
export type JsonExtractSourceHandle = (typeof JSON_EXTRACT_SOURCE_HANDLES)[number];

export function normalizeJsonExtractNodeData(raw: unknown): JsonExtractNodeData {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const label =
    typeof data.label === "string" && data.label.trim() ? data.label : "Извлечь из JSON";

  const sourceVariableRaw =
    typeof data.sourceVariable === "string" ? normalizeVariableKey(data.sourceVariable) : "";
  const sourceVariable = isValidVariableKey(sourceVariableRaw) ? sourceVariableRaw : "response";

  const path = typeof data.path === "string" ? data.path.trim() : "";

  const targetVariableRaw =
    typeof data.targetVariable === "string" ? normalizeVariableKey(data.targetVariable) : "";
  const targetVariable = isValidVariableKey(targetVariableRaw) ? targetVariableRaw : "extracted";

  return { label, sourceVariable, path, targetVariable };
}

export function isValidJsonExtractSourceHandle(
  handleId: string | null | undefined,
): handleId is JsonExtractSourceHandle {
  return handleId == null || handleId === "next";
}

export function buildJsonExtractPreview(data: JsonExtractNodeData): string {
  const path = data.path.trim() || "(весь объект)";
  return `var.${data.sourceVariable}.${path} → var.${data.targetVariable}`;
}

/**
 * Достать значение по dot/bracket-пути из JSON-строки.
 * Поддержка: a.b.c, a[0].b, items.0.name. Возвращает строку для записи в переменную.
 */
export function extractJsonValue(rawJson: string, path: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }

  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  }

  const segments = trimmedPath
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  let current: unknown = parsed;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (current == null) {
    return null;
  }

  return typeof current === "string" ? current : JSON.stringify(current);
}
