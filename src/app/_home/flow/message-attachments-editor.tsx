"use client";

import { FileIcon, GripVerticalIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MessageAttachment, MessageAttachmentsMode } from "@/lib/flow/flow-schema";
import {
  getAttachmentAccept,
  getAttachmentItemLabel,
  getProjectAssetUrl,
  MAX_MESSAGE_ATTACHMENTS,
  reorderAttachments,
  resolveAttachmentKind,
  validateAttachmentAdd,
} from "@/lib/flow/message-attachments";
import { createMessageAttachmentId } from "@/lib/flow/message-node-utils";
import { getMessageTextLimit, truncateTelegramPlainText } from "@/lib/flow/telegram-limits";
import { cn } from "@/lib/utils";

type MessageAttachmentsEditorProps = {
  projectId: string;
  mode: MessageAttachmentsMode;
  attachments: MessageAttachment[];
  messageText: string;
  onUpdate: (patch: {
    attachmentsMode?: MessageAttachmentsMode;
    attachments?: MessageAttachment[];
    text?: string;
  }) => void;
};

export function MessageAttachmentsEditor({
  projectId,
  mode,
  attachments,
  messageText,
  onUpdate,
}: MessageAttachmentsEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverTargetId, setCoverTargetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function setMode(nextMode: MessageAttachmentsMode) {
    if (nextMode === mode) {
      return;
    }

    onUpdate({
      attachmentsMode: nextMode,
      attachments: [],
      text: truncateTelegramPlainText(messageText, getMessageTextLimit([])),
    });
    setUploadError(null);
  }

  async function uploadFile(file: File, currentAttachments: MessageAttachment[]) {
    const kind = resolveAttachmentKind(file, mode);
    if (!kind) {
      throw new Error(getUploadKindError(mode));
    }

    const validationError = validateAttachmentAdd(currentAttachments, kind, mode);
    if (validationError) {
      throw new Error(validationError);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);

    const response = await fetch(`/api/projects/${projectId}/assets`, {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as {
      asset?: { id: string; fileName?: string };
      error?: string;
    };

    if (!(response.ok && payload.asset)) {
      throw new Error(payload.error ?? "Не удалось загрузить файл");
    }

    return {
      id: createMessageAttachmentId(),
      kind,
      assetId: payload.asset.id,
      fileName: payload.asset.fileName ?? file.name,
    } satisfies MessageAttachment;
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const nextAttachments = [...attachments];

      for (const file of files) {
        if (nextAttachments.length >= MAX_MESSAGE_ATTACHMENTS) {
          throw new Error(`Максимум ${MAX_MESSAGE_ATTACHMENTS} вложений`);
        }

        const attachment = await uploadFile(file, nextAttachments);
        const validationError = validateAttachmentAdd(nextAttachments, attachment.kind, mode);
        if (validationError) {
          throw new Error(validationError);
        }

        nextAttachments.push(attachment);
      }

      onUpdate({
        attachmentsMode: mode,
        attachments: nextAttachments,
        text: truncateTelegramPlainText(messageText, getMessageTextLimit(nextAttachments)),
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }

  function handleDragOver(event: DragEvent) {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      setIsDropTarget(true);
    }
  }

  function handleDragLeave(event: DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDropTarget(false);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setIsDropTarget(false);

    const files = event.dataTransfer.types.includes("Files") ? [...event.dataTransfer.files] : [];
    if (files.length > 0) {
      void uploadFiles(files);
    }
  }

  function removeAttachment(id: string) {
    const nextAttachments = attachments.filter((item) => item.id !== id);
    onUpdate({
      attachmentsMode: mode,
      attachments: nextAttachments,
      text: truncateTelegramPlainText(messageText, getMessageTextLimit(nextAttachments)),
    });
  }

  async function uploadCover(file: File, attachmentId: string) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", "photo");

    const response = await fetch(`/api/projects/${projectId}/assets`, {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as {
      asset?: { id: string };
      error?: string;
    };

    if (!(response.ok && payload.asset)) {
      throw new Error(payload.error ?? "Не удалось загрузить обложку");
    }

    onUpdate({
      attachmentsMode: mode,
      attachments: attachments.map((item) =>
        item.id === attachmentId ? { ...item, coverAssetId: payload.asset?.id } : item,
      ),
    });
  }

  function toggleSpoiler(attachmentId: string, checked: boolean) {
    onUpdate({
      attachmentsMode: mode,
      attachments: attachments.map((item) =>
        item.id === attachmentId ? { ...item, hasSpoiler: checked } : item,
      ),
    });
  }

  const canAddMore =
    mode === "video_note" ? attachments.length === 0 : attachments.length < MAX_MESSAGE_ATTACHMENTS;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FieldLabel className="w-full">Вложения</FieldLabel>
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as MessageAttachmentsMode)}
          className="w-full min-w-0"
        >
          <TabsList className="h-auto min-h-8 w-full flex-wrap justify-start">
            <TabsTrigger value="album" className="flex-none px-2.5 text-xs">
              Альбом
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex-none px-2.5 text-xs">
              Документы
            </TabsTrigger>
            <TabsTrigger value="video_note" className="flex-none px-2.5 text-xs">
              Кружок
            </TabsTrigger>
            <TabsTrigger value="audio" className="flex-none px-2.5 text-xs">
              Аудио
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: file drop zone; drag-and-drop has no semantic ARIA role and is paired with a button-triggered file picker */}
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded-lg border border-dashed p-4 transition-colors",
          isDropTarget
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/20 hover:border-muted-foreground/40",
        )}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-foreground">{getDropZoneTitle(mode)}</p>
          <FieldDescription className="text-center">
            {mode === "video_note"
              ? "Один MP4-файл для видеокружка"
              : `Перетащите файлы сюда или нажмите «Загрузить». До ${MAX_MESSAGE_ATTACHMENTS} шт.`}
          </FieldDescription>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading || !canAddMore}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="size-4" />
            Загрузить
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple={mode !== "video_note"}
        accept={getAttachmentAccept(mode)}
        onChange={(event) => {
          const files = event.target.files ? [...event.target.files] : [];
          event.target.value = "";
          if (files.length > 0) {
            void uploadFiles(files);
          }
        }}
      />

      <input
        ref={coverInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && coverTargetId) {
            void uploadCover(file, coverTargetId).catch((error) => {
              setUploadError(
                error instanceof Error ? error.message : "Не удалось загрузить обложку",
              );
            });
          }
          setCoverTargetId(null);
        }}
      />

      {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}

      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment, index) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: draggable list row for reordering attachments; drag handle has no semantic ARIA equivalent
            <div
              key={attachment.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", attachment.id);
                event.dataTransfer.effectAllowed = "move";
                setDraggingId(attachment.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDropTargetId(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggingId && draggingId !== attachment.id) {
                  setDropTargetId(attachment.id);
                }
              }}
              onDragLeave={() => {
                if (dropTargetId === attachment.id) {
                  setDropTargetId(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggingId || draggingId === attachment.id) {
                  return;
                }

                onUpdate({
                  attachmentsMode: mode,
                  attachments: reorderAttachments(attachments, draggingId, attachment.id),
                });
                setDraggingId(null);
                setDropTargetId(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border bg-card p-2 transition-colors",
                draggingId === attachment.id && "opacity-50",
                dropTargetId === attachment.id && "border-primary bg-primary/5",
              )}
            >
              <GripVerticalIcon className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
              <AttachmentPreviewThumb projectId={projectId} attachment={attachment} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{getAttachmentItemLabel(attachment, index)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {getAttachmentKindLabel(attachment.kind)}
                  {index === 0 && (mode === "album" || mode === "audio") ? " · с подписью" : null}
                  {attachment.coverAssetId ? " · обложка" : null}
                </p>
                {mode === "album" &&
                (attachment.kind === "photo" || attachment.kind === "video") ? (
                  <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={attachment.hasSpoiler === true}
                      onCheckedChange={(value) => toggleSpoiler(attachment.id, value === true)}
                    />
                    Спойлер
                  </label>
                ) : null}
              </div>
              {mode === "album" && attachment.kind === "video" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs"
                  onClick={() => {
                    setCoverTargetId(attachment.id);
                    coverInputRef.current?.click();
                  }}
                >
                  Обложка
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => removeAttachment(attachment.id)}
                aria-label="Удалить вложение"
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AttachmentPreviewThumb({
  projectId,
  attachment,
}: {
  projectId: string;
  attachment: MessageAttachment;
}) {
  const url = getProjectAssetUrl(projectId, attachment.assetId);
  const frameClass =
    "size-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted object-cover";

  if (attachment.kind === "photo") {
    return (
      // biome-ignore lint/performance/noImgElement: preview of a user-uploaded blob/object URL; next/image cannot optimize dynamic local URLs
      <img src={url} alt="" className={frameClass} loading="lazy" />
    );
  }

  if (attachment.kind === "video" || attachment.kind === "video_note") {
    return <video src={url} muted playsInline preload="metadata" className={frameClass} />;
  }

  if (attachment.kind === "audio") {
    return (
      <div className={cn(frameClass, "flex items-center justify-center object-none")}>
        <FileIcon className="size-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn(frameClass, "flex items-center justify-center object-none")}>
      <FileIcon className="size-5 text-muted-foreground" />
    </div>
  );
}

function getDropZoneTitle(mode: MessageAttachmentsMode): string {
  switch (mode) {
    case "album":
      return "Фото и видео для альбома";
    case "documents":
      return "Файлы для отправки";
    case "video_note":
      return "Видеокружок";
    case "audio":
      return "Аудиофайлы";
    default:
      return "Вложения";
  }
}

function getUploadKindError(mode: MessageAttachmentsMode): string {
  switch (mode) {
    case "album":
      return "В альбом можно добавить только фото или видео";
    case "video_note":
      return "Загрузите MP4 для видеокружка";
    case "audio":
      return "Загрузите аудиофайл";
    default:
      return "Не удалось определить тип файла";
  }
}

function getAttachmentKindLabel(kind: MessageAttachment["kind"]): string {
  switch (kind) {
    case "photo":
      return "Фото";
    case "video":
      return "Видео";
    case "video_note":
      return "Видеокружок";
    case "audio":
      return "Аудио";
    default:
      return "Документ";
  }
}
