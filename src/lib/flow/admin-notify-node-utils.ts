import type { AdminNotifyNodeData } from "@/lib/flow/flow-schema";
import { stripTextEmojisOptional } from "@/lib/text/strip-emojis";

export const ADMIN_NOTIFY_SOURCE_HANDLES = ["next"] as const;
export type AdminNotifySourceHandle = (typeof ADMIN_NOTIFY_SOURCE_HANDLES)[number];

export const DEFAULT_ADMIN_CHAT_TEMPLATE = "{{secret.ADMIN_CHAT_ID}}";

export function normalizeAdminNotifyNodeData(raw: unknown): AdminNotifyNodeData {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const label =
    typeof data.label === "string" && data.label.trim() ? data.label : "Уведомить админа";
  const chatId =
    typeof data.chatId === "string" && data.chatId.trim()
      ? data.chatId.trim()
      : DEFAULT_ADMIN_CHAT_TEMPLATE;
  const text = typeof data.text === "string" ? (stripTextEmojisOptional(data.text) ?? "") : "";

  return { label, chatId, text };
}

export function isValidAdminNotifySourceHandle(
  handleId: string | null | undefined,
): handleId is AdminNotifySourceHandle {
  return handleId == null || handleId === "next";
}

export function buildAdminNotifyPreview(data: AdminNotifyNodeData): string {
  const target = data.chatId.trim() || DEFAULT_ADMIN_CHAT_TEMPLATE;
  const text = data.text.trim();
  return text ? `→ ${target}: ${text}` : `→ ${target}`;
}
