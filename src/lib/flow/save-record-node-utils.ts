import type { SaveRecordField, SaveRecordNodeData } from "@/lib/flow/flow-schema";
import { stripTextEmojisOptional } from "@/lib/text/strip-emojis";

export const SAVE_RECORD_SOURCE_HANDLES = ["next"] as const;
export type SaveRecordSourceHandle = (typeof SAVE_RECORD_SOURCE_HANDLES)[number];

export const DEFAULT_SAVE_RECORD_COLLECTION = "records";

/** Нормализовать имя коллекции: латиница/цифры/подчёркивание, нижний регистр. */
export function normalizeCollectionName(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const cleaned = value.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || DEFAULT_SAVE_RECORD_COLLECTION;
}

function normalizeField(raw: unknown): SaveRecordField | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as { key?: unknown; value?: unknown };
  const key = typeof item.key === "string" ? item.key.trim() : "";
  if (!key) {
    return null;
  }
  const value = typeof item.value === "string" ? (stripTextEmojisOptional(item.value) ?? "") : "";
  return { key, value };
}

export function normalizeSaveRecordNodeData(raw: unknown): SaveRecordNodeData {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const label = typeof data.label === "string" && data.label.trim() ? data.label.trim() : "Запись";
  const collection = normalizeCollectionName(data.collection);
  const fields = Array.isArray(data.fields)
    ? data.fields.map(normalizeField).filter((field): field is SaveRecordField => field !== null)
    : [];

  return { label, collection, fields };
}

export function isValidSaveRecordSourceHandle(
  handleId: string | null | undefined,
): handleId is SaveRecordSourceHandle {
  return handleId == null || handleId === "next";
}

export function buildSaveRecordPreview(data: SaveRecordNodeData): string {
  if (data.fields.length === 0) {
    return `→ ${data.collection} (поля не заданы)`;
  }
  const keys = data.fields.map((field) => field.key).join(", ");
  return `→ ${data.collection}: ${keys}`;
}
