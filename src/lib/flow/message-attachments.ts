import type {
  MessageAttachment,
  MessageAttachmentKind,
  MessageAttachmentsMode,
} from "@/lib/flow/flow-schema";

export const MAX_MESSAGE_ATTACHMENTS = 10;

const albumKindLabels: Record<"photo" | "video", string> = {
  photo: "Фото",
  video: "Видео",
};

export function normalizeAttachmentsMode(
  raw: unknown,
  attachments: MessageAttachment[],
): MessageAttachmentsMode | undefined {
  if (raw === "album" || raw === "documents" || raw === "video_note" || raw === "audio") {
    return raw;
  }

  return attachments.length > 0 ? inferAttachmentsMode(attachments) : undefined;
}

export function inferAttachmentsMode(attachments: MessageAttachment[]): MessageAttachmentsMode {
  if (attachments.some((item) => item.kind === "audio")) {
    return "audio";
  }

  if (attachments.some((item) => item.kind === "video_note")) {
    return "video_note";
  }

  if (attachments.some((item) => item.kind === "document")) {
    return "documents";
  }

  return "album";
}

export function resolveAttachmentKind(
  file: File,
  mode: MessageAttachmentsMode,
): MessageAttachmentKind | null {
  const mimeType = file.type || "application/octet-stream";

  if (mode === "documents") {
    return "document";
  }

  if (mode === "video_note") {
    return mimeType === "video/mp4" || mimeType.startsWith("video/") ? "video_note" : null;
  }

  if (mode === "audio") {
    return mimeType.startsWith("audio/") ? "audio" : null;
  }

  if (mimeType.startsWith("image/")) {
    return "photo";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return null;
}

export function getAttachmentAccept(mode: MessageAttachmentsMode): string {
  if (mode === "album") {
    return "image/*,video/*";
  }

  if (mode === "video_note") {
    return "video/mp4,video/*";
  }

  if (mode === "audio") {
    return "audio/*";
  }

  return "*/*";
}

export function getProjectAssetUrl(projectId: string, assetId: string): string {
  return `/api/projects/${projectId}/assets/${assetId}`;
}

export function getAttachmentItemLabel(attachment: MessageAttachment, index: number): string {
  if (attachment.fileName) {
    return attachment.fileName;
  }

  if (attachment.kind === "document") {
    return `Документ ${index + 1}`;
  }

  if (attachment.kind === "video_note") {
    return "Видеокружок";
  }

  if (attachment.kind === "audio") {
    return attachment.fileName ?? `Аудио ${index + 1}`;
  }

  if (attachment.kind === "photo" || attachment.kind === "video") {
    return `${albumKindLabels[attachment.kind]} ${index + 1}`;
  }

  return `Вложение ${index + 1}`;
}

export function validateAttachmentAdd(
  attachments: MessageAttachment[],
  kind: MessageAttachmentKind,
  mode: MessageAttachmentsMode,
): string | null {
  if (attachments.length >= MAX_MESSAGE_ATTACHMENTS) {
    return `Максимум ${MAX_MESSAGE_ATTACHMENTS} вложений`;
  }

  if (mode === "video_note") {
    if (kind !== "video_note") {
      return "В режиме «Видеокружок» можно загрузить только видео";
    }

    if (attachments.length > 0) {
      return "Видеокружок можно добавить только один";
    }

    return null;
  }

  if (mode === "audio") {
    if (kind !== "audio") {
      return "В режиме «Аудио» можно загружать только аудиофайлы";
    }

    if (attachments.some((item) => item.kind !== "audio")) {
      return "Сначала удалите вложения другого типа";
    }

    return null;
  }

  if (mode === "album") {
    if (kind === "document" || kind === "video_note" || kind === "audio") {
      return "В альбом можно добавлять только фото и видео";
    }

    if (attachments.some((item) => item.kind === "document")) {
      return "Сначала удалите документы или переключитесь в режим «Документы»";
    }

    return null;
  }

  if (kind !== "document") {
    return "В режиме «Документы» можно загружать только файлы";
  }

  if (attachments.some((item) => item.kind !== "document")) {
    return "Сначала удалите элементы альбома или переключитесь в режим «Альбом»";
  }

  return null;
}

export function reorderAttachments(
  attachments: MessageAttachment[],
  activeId: string,
  overId: string,
): MessageAttachment[] {
  const fromIndex = attachments.findIndex((item) => item.id === activeId);
  const toIndex = attachments.findIndex((item) => item.id === overId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return attachments;
  }

  const next = [...attachments];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
