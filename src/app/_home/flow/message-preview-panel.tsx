"use client";

import { FileIcon, MicIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { InlineButton, MessageAttachment, MessageNodeData } from "@/lib/flow/flow-schema";
import { getProjectAssetUrl } from "@/lib/flow/message-attachments";
import { telegramHtmlToPreviewHtml } from "@/lib/flow/telegram-html-preview";
import { messageTextUsesMediaCaption } from "@/lib/flow/telegram-limits";
import {
  buildPreviewCustomVars,
  buildPreviewTemplateVars,
  DEFAULT_PREVIEW_NICKNAME,
  interpolateTemplate,
} from "@/lib/flow/template-vars";
import { cn } from "@/lib/utils";

import "./message-preview-panel.css";

type MessagePreviewPanelProps = {
  projectId: string;
  data: MessageNodeData;
  flowVariableKeys?: string[];
};

export function MessagePreviewPanel({
  projectId,
  data,
  flowVariableKeys = [],
}: MessagePreviewPanelProps) {
  const [previewNickname, setPreviewNickname] = useState(DEFAULT_PREVIEW_NICKNAME);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(() => new Set());

  const attachments = data.attachments ?? [];
  const attachmentsMode = data.attachmentsMode ?? "album";
  const usesMediaCaption = messageTextUsesMediaCaption(attachments);
  const parseMode = data.parseMode ?? "HTML";

  const previewHtml = useMemo(() => {
    if (!data.text?.trim()) {
      return "";
    }

    const vars = buildPreviewTemplateVars(
      previewNickname,
      buildPreviewCustomVars(flowVariableKeys),
    );
    const interpolated = interpolateTemplate(data.text, vars, parseMode);

    if (parseMode === "HTML") {
      return telegramHtmlToPreviewHtml(interpolated);
    }

    return interpolated;
  }, [data.text, parseMode, previewNickname, flowVariableKeys]);

  const inlineRows =
    data.keyboard?.type === "inline" ? data.keyboard.rows.filter((row) => row.length > 0) : [];

  const hasBubbleContent = Boolean(previewHtml) || attachments.length > 0 || inlineRows.length > 0;

  function toggleSpoilerReveal(id: string) {
    setRevealedSpoilers((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <Field>
        <FieldLabel htmlFor="message-preview-nickname">Никнейм для превью</FieldLabel>
        <Input
          id="message-preview-nickname"
          value={previewNickname}
          onChange={(event) => setPreviewNickname(event.target.value)}
          placeholder={DEFAULT_PREVIEW_NICKNAME}
        />
        <FieldDescription>
          Подставляется вместо {"{{nickname}}"} и {"{{first_name}}"} в превью ниже.
        </FieldDescription>
      </Field>

      <div className="telegram-message-preview-shell rounded-xl p-3">
        <div className="flex justify-end">
          <div className="telegram-message-preview-bubble w-full max-w-[92%] overflow-hidden">
            {!hasBubbleContent ? (
              <p className="px-3 py-2.5 text-sm text-white/45">Пустое сообщение</p>
            ) : (
              <div className="space-y-2 p-2.5">
                {usesMediaCaption && data.showCaptionAboveMedia && previewHtml ? (
                  <PreviewText html={previewHtml} />
                ) : null}

                {attachments.length > 0 ? (
                  <PreviewAttachments
                    projectId={projectId}
                    mode={attachmentsMode}
                    attachments={attachments}
                    revealedSpoilers={revealedSpoilers}
                    onToggleSpoiler={toggleSpoilerReveal}
                  />
                ) : null}

                {previewHtml && !(usesMediaCaption && data.showCaptionAboveMedia) ? (
                  <PreviewText html={previewHtml} />
                ) : null}

                {inlineRows.length > 0 ? <PreviewInlineKeyboard rows={inlineRows} /> : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewText({ html }: { html: string }) {
  if (!html.trim()) {
    return null;
  }

  return (
    <div
      className="telegram-message-preview-text text-sm leading-relaxed text-white/95"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: html is produced by telegramHtmlToPreviewHtml, which escapes all input then re-enables only a fixed whitelist of attribute-less tags
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function PreviewAttachments({
  projectId,
  mode,
  attachments,
  revealedSpoilers,
  onToggleSpoiler,
}: {
  projectId: string;
  mode: MessageNodeData["attachmentsMode"];
  attachments: MessageAttachment[];
  revealedSpoilers: Set<string>;
  onToggleSpoiler: (id: string) => void;
}) {
  if (mode === "video_note" && attachments[0]) {
    return (
      <PreviewAttachmentItem
        projectId={projectId}
        attachment={attachments[0]}
        revealed={revealedSpoilers.has(attachments[0].id)}
        onToggleSpoiler={() => onToggleSpoiler(attachments[0].id)}
        round
      />
    );
  }

  if (mode === "audio") {
    return (
      <div className="space-y-2">
        {attachments.map((attachment) => (
          <PreviewAudioItem key={attachment.id} projectId={projectId} attachment={attachment} />
        ))}
      </div>
    );
  }

  const gridClass =
    mode === "documents"
      ? "flex flex-col gap-2"
      : attachments.length === 1
        ? "grid grid-cols-1"
        : attachments.length === 2
          ? "grid grid-cols-2 gap-1"
          : "grid grid-cols-2 gap-1";

  return (
    <div className={gridClass}>
      {attachments.map((attachment) => (
        <PreviewAttachmentItem
          key={attachment.id}
          projectId={projectId}
          attachment={attachment}
          revealed={revealedSpoilers.has(attachment.id)}
          onToggleSpoiler={() => onToggleSpoiler(attachment.id)}
          compact={attachments.length > 1 && mode === "album"}
        />
      ))}
    </div>
  );
}

function PreviewAttachmentItem({
  projectId,
  attachment,
  revealed,
  onToggleSpoiler,
  round = false,
  compact = false,
}: {
  projectId: string;
  attachment: MessageAttachment;
  revealed: boolean;
  onToggleSpoiler: () => void;
  round?: boolean;
  compact?: boolean;
}) {
  const url = getProjectAssetUrl(projectId, attachment.assetId);
  const isSpoiler = attachment.hasSpoiler === true;
  const showSpoiler = isSpoiler && !revealed;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-black/20",
        round ? "mx-auto size-36 rounded-full" : "rounded-lg",
        compact ? "aspect-square" : "aspect-video max-h-40",
      )}
    >
      {attachment.kind === "photo" ? (
        // biome-ignore lint/performance/noImgElement: preview of a user-uploaded blob/object URL; next/image cannot optimize dynamic local URLs
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : attachment.kind === "video" || attachment.kind === "video_note" ? (
        <video src={url} muted playsInline preload="metadata" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center gap-2 px-3 text-white/80">
          <FileIcon className="size-5 shrink-0" />
          <span className="truncate text-xs">{attachment.fileName ?? "Документ"}</span>
        </div>
      )}

      {showSpoiler ? (
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center bg-black/35 text-xs font-medium text-white/90 backdrop-blur-md"
          onClick={onToggleSpoiler}
        >
          Спойлер
        </button>
      ) : null}
    </div>
  );
}

function PreviewAudioItem({
  projectId,
  attachment,
}: {
  projectId: string;
  attachment: MessageAttachment;
}) {
  const url = getProjectAssetUrl(projectId, attachment.assetId);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/15 px-3 py-2 text-white/90">
      <div className="flex size-8 items-center justify-center rounded-full bg-white/10">
        <MicIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{attachment.fileName ?? "Аудио"}</p>
        {/* biome-ignore lint/a11y/useMediaCaption: preview of a user-uploaded audio file; no caption track is available */}
        <audio src={url} controls preload="none" className="mt-1 h-7 w-full max-w-full" />
      </div>
    </div>
  );
}

function PreviewInlineKeyboard({ rows }: { rows: InlineButton[][] }) {
  return (
    <div className="space-y-1 border-t border-white/10 pt-2">
      {rows.map((row, rowIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static preview rows have no stable id and never reorder
        <div key={`preview-inline-row-${rowIndex}`} className="flex gap-1">
          {row.map((button) => (
            <span
              key={button.id}
              className="flex min-h-8 flex-1 items-center justify-center rounded-md bg-white/10 px-2 py-1.5 text-center text-xs font-medium text-sky-200"
            >
              {button.text || "Кнопка"}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
