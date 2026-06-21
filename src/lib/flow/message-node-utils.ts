import type {
  InlineButton,
  MessageAttachment,
  MessageKeyboard,
  MessageNodeData,
  ReplyKeyboardButton,
} from "@/lib/flow/flow-schema";
import { normalizeAttachmentsMode } from "@/lib/flow/message-attachments";
import { clampButtonText } from "@/lib/flow/telegram-button-limits";
import { stripTelegramHtml } from "@/lib/flow/telegram-html-preview";
import {
  buildPreviewTemplateVars,
  DEFAULT_PREVIEW_NICKNAME,
  interpolateTemplate,
} from "@/lib/flow/template-vars";

export function createMessageButtonId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function createMessageAttachmentId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function formatCallbackData(nodeId: string, buttonId: string): string {
  return `cb:${nodeId}:${buttonId}`;
}

export function parseCallbackData(data: string): { nodeId: string; buttonId: string } | null {
  if (!data.startsWith("cb:")) {
    return null;
  }

  const rest = data.slice(3);
  const separator = rest.indexOf(":");
  if (separator <= 0) {
    return null;
  }

  return {
    nodeId: rest.slice(0, separator),
    buttonId: rest.slice(separator + 1),
  };
}

export function normalizeMessageNodeData(raw: unknown): MessageNodeData {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const label = typeof data.label === "string" ? data.label : "Сообщение";

  const text =
    typeof data.text === "string"
      ? data.text
      : typeof (data as { content?: { text?: string } }).content?.text === "string"
        ? (data as { content: { text: string } }).content.text
        : "";

  const parseMode =
    data.parseMode === "HTML" || data.parseMode === "MarkdownV2"
      ? data.parseMode
      : data.parseMode === null
        ? null
        : "HTML";

  const linkPreview = typeof data.linkPreview === "boolean" ? data.linkPreview : true;

  const attachments = normalizeAttachments(data.attachments);
  const attachmentsMode = normalizeAttachmentsMode(data.attachmentsMode, attachments);
  const keyboard = normalizeKeyboard(data.keyboard);
  const delaySeconds =
    typeof data.delaySeconds === "number" && data.delaySeconds > 0
      ? Math.floor(data.delaySeconds)
      : undefined;

  return {
    label,
    text,
    parseMode,
    linkPreview,
    ...(attachmentsMode ? { attachmentsMode } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(keyboard ? { keyboard } : {}),
    ...(data.showCaptionAboveMedia === true ? { showCaptionAboveMedia: true } : {}),
    ...(data.showTyping === true ? { showTyping: true } : {}),
    ...(data.silent === true ? { silent: true } : {}),
    ...(data.protectContent === true ? { protectContent: true } : {}),
    ...(data.replyToUser === true ? { replyToUser: true } : {}),
    ...(delaySeconds != null ? { delaySeconds } : {}),
  };
}

function normalizeAttachments(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const attachment = item as Partial<MessageAttachment>;
      if (
        typeof attachment.id !== "string" ||
        typeof attachment.assetId !== "string" ||
        !isAttachmentKind(attachment.kind)
      ) {
        return null;
      }

      return {
        id: attachment.id,
        kind: attachment.kind,
        assetId: attachment.assetId,
        ...(typeof attachment.fileName === "string" && attachment.fileName.trim()
          ? { fileName: attachment.fileName.trim() }
          : {}),
        ...(attachment.hasSpoiler === true ? { hasSpoiler: true } : {}),
        ...(typeof attachment.coverAssetId === "string" && attachment.coverAssetId
          ? { coverAssetId: attachment.coverAssetId }
          : {}),
      };
    })
    .filter((item): item is MessageAttachment => item !== null);
}

function normalizeKeyboard(raw: unknown): MessageKeyboard | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const keyboard = raw as {
    type?: unknown;
    rows?: unknown;
    buttons?: unknown;
    oneTime?: unknown;
    resize?: unknown;
  };
  if (keyboard.type === "remove") {
    return { type: "remove" };
  }

  // Принимаем как канонический `rows`, так и сокращённый `buttons` (его генерирует ИИ).
  const sourceRows: unknown[] = Array.isArray(keyboard.rows)
    ? keyboard.rows
    : Array.isArray(keyboard.buttons)
      ? keyboard.buttons
      : [];

  if (keyboard.type === "inline" && sourceRows.length > 0) {
    const rows = sourceRows
      .map((row) =>
        Array.isArray(row)
          ? row
              .map((btn) => normalizeInlineButton(btn))
              .filter((btn): btn is InlineButton => btn !== null)
          : [],
      )
      .filter((row) => row.length > 0);

    return rows.length > 0 ? { type: "inline", rows } : undefined;
  }

  if (keyboard.type === "reply" && sourceRows.length > 0) {
    const rows = sourceRows
      .map((row) =>
        Array.isArray(row)
          ? row
              .map((btn) => normalizeReplyButton(btn))
              .filter((btn): btn is ReplyKeyboardButton => btn !== null)
          : [],
      )
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      return undefined;
    }

    return {
      type: "reply",
      rows,
      ...(keyboard.oneTime === true ? { oneTime: true } : {}),
      ...(keyboard.resize === true ? { resize: true } : {}),
    };
  }

  return undefined;
}

function normalizeInlineButton(raw: unknown): InlineButton | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    return text
      ? { id: createMessageButtonId(), text: clampButtonText(text), kind: "callback" }
      : null;
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const btn = raw as Partial<InlineButton> & Record<string, unknown>;
  if (typeof btn.text !== "string" || !btn.text.trim()) {
    return null;
  }

  const id = typeof btn.id === "string" && btn.id ? btn.id : createMessageButtonId();
  const text = clampButtonText(btn.text.trim());
  const kind = btn.kind ?? "callback";

  if (kind === "url") {
    if (typeof btn.url !== "string" || !btn.url.trim()) {
      return null;
    }

    return { id, text, kind: "url", url: btn.url.trim() };
  }

  if (kind === "web_app") {
    const webAppUrl = typeof btn.webAppUrl === "string" ? btn.webAppUrl.trim() : "";
    if (!webAppUrl) {
      return null;
    }

    return { id, text, kind: "web_app", webAppUrl };
  }

  if (kind === "copy_text") {
    const copyText = typeof btn.copyText === "string" ? btn.copyText : "";
    if (!copyText.trim()) {
      return null;
    }

    return { id, text, kind: "copy_text", copyText };
  }

  if (kind === "switch_inline") {
    const switchInlineQuery =
      typeof btn.switchInlineQuery === "string" ? btn.switchInlineQuery : "";
    return { id, text, kind: "switch_inline", switchInlineQuery };
  }

  return { id, text, kind: "callback" };
}

function normalizeReplyButton(raw: unknown): ReplyKeyboardButton | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    return text ? { id: createMessageButtonId(), text: clampButtonText(text), kind: "text" } : null;
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const btn = raw as Partial<ReplyKeyboardButton> & { kind?: string };
  if (typeof btn.text !== "string" || !btn.text.trim()) {
    return null;
  }

  const id = typeof btn.id === "string" && btn.id ? btn.id : createMessageButtonId();
  const text = clampButtonText(btn.text.trim());
  const kind = btn.kind ?? "text";

  if (kind === "request_contact") {
    return { id, text, kind: "request_contact" };
  }

  if (kind === "request_location") {
    return { id, text, kind: "request_location" };
  }

  return { id, text, kind: "text" };
}

function isAttachmentKind(value: unknown): value is MessageAttachment["kind"] {
  return (
    value === "photo" ||
    value === "video" ||
    value === "document" ||
    value === "video_note" ||
    value === "audio"
  );
}

export type MessageSourceHandle = {
  id: string;
  label: string;
};

export function getMessageSourceHandles(data: MessageNodeData): MessageSourceHandle[] {
  const handles: MessageSourceHandle[] = [];
  const keyboard = data.keyboard;

  if (keyboard?.type === "inline") {
    for (const row of keyboard.rows) {
      for (const button of row) {
        if (button.kind === "callback") {
          handles.push({ id: `btn-${button.id}`, label: button.text });
        }
      }
    }
  }

  if (keyboard?.type === "reply") {
    for (const row of keyboard.rows) {
      for (const button of row) {
        if (button.kind === "text") {
          handles.push({ id: `reply-${button.id}`, label: button.text });
        }
      }
    }
  }

  // «Далее» только у линейных сообщений без ветвления по кнопкам.
  if (handles.length === 0) {
    handles.push({ id: "next", label: "Далее" });
  }

  return handles;
}

export function isValidMessageSourceHandle(
  data: MessageNodeData,
  handleId: string | null | undefined,
): boolean {
  const normalized = handleId ?? "next";
  return getMessageSourceHandles(data).some((handle) => handle.id === normalized);
}

export function buildMessagePreview(
  data: MessageNodeData,
  previewNickname: string = DEFAULT_PREVIEW_NICKNAME,
): string {
  const parts: string[] = [];

  if (data.text?.trim()) {
    const parseMode = data.parseMode ?? "HTML";
    const interpolated = interpolateTemplate(
      data.text,
      buildPreviewTemplateVars(previewNickname),
      parseMode,
    );
    const plain =
      parseMode === "HTML" ? stripTelegramHtml(interpolated).trim() : interpolated.trim();
    if (plain) {
      parts.push(plain);
    }
  }

  if (data.attachments?.length) {
    const count = data.attachments.length;
    parts.push(formatAttachmentCount(count));
  }

  if (data.keyboard?.type === "inline") {
    const count = data.keyboard.rows.flat().length;
    parts.push(`${count} inline-кн.`);
  } else if (data.keyboard?.type === "reply") {
    const count = data.keyboard.rows.flat().length;
    parts.push(`${count} reply-кн.`);
  }

  return parts.join(" · ") || "Пустое сообщение";
}

function formatAttachmentCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} вложение`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} вложения`;
  }

  return `${count} вложений`;
}

export function findReplyButtonByText(
  data: MessageNodeData,
  text: string,
): ReplyKeyboardButton | null {
  if (data.keyboard?.type !== "reply") {
    return null;
  }

  const normalized = text.trim();
  for (const row of data.keyboard.rows) {
    for (const button of row) {
      if (button.kind === "text" && button.text === normalized) {
        return button;
      }
    }
  }

  return null;
}
