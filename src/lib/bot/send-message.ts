import { type Api, type Context, InlineKeyboard, InputFile, Keyboard, type RawApi } from "grammy";

import {
  getProjectAsset,
  readAssetBuffer,
  updateAssetTelegramFileId,
} from "@/lib/assets/project-assets";
import { recordBotEvent } from "@/lib/bot/bot-analytics";
import type { MessageAttachment, MessageKeyboard, MessageNodeData } from "@/lib/flow/flow-schema";
import { formatCallbackData } from "@/lib/flow/message-node-utils";

export type OutboundMessagePayload = Pick<
  MessageNodeData,
  | "text"
  | "parseMode"
  | "linkPreview"
  | "attachments"
  | "keyboard"
  | "silent"
  | "protectContent"
  | "replyToUser"
  | "showCaptionAboveMedia"
> & {
  userMessageId?: number;
};

export type SendOutboundResult = {
  replyKeyboardSession?: {
    nodeId: string;
    buttons: {
      id: string;
      text: string;
      kind: "text" | "request_contact" | "request_location";
    }[];
  };
};

type CommonOptions = {
  parse_mode?: "HTML" | "MarkdownV2";
  link_preview_options?: { is_disabled: boolean };
  reply_markup?: InlineKeyboard | Keyboard;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_parameters?: { message_id: number };
  show_caption_above_media?: boolean;
};

function buildCommonOptions(payload: OutboundMessagePayload): CommonOptions {
  const options: CommonOptions = {};

  if (payload.parseMode) {
    options.parse_mode = payload.parseMode;
  }

  if (payload.linkPreview === false) {
    options.link_preview_options = { is_disabled: true };
  }

  if (payload.silent) {
    options.disable_notification = true;
  }

  if (payload.protectContent) {
    options.protect_content = true;
  }

  if (payload.replyToUser && payload.userMessageId != null) {
    options.reply_parameters = { message_id: payload.userMessageId };
  }

  if (payload.showCaptionAboveMedia) {
    options.show_caption_above_media = true;
  }

  return options;
}

function buildInlineKeyboard(
  nodeId: string,
  keyboard: Extract<MessageKeyboard, { type: "inline" }>,
) {
  const markup = new InlineKeyboard();

  keyboard.rows.forEach((row, rowIndex) => {
    row.forEach((button) => {
      switch (button.kind) {
        case "url":
          markup.url(button.text, button.url);
          break;
        case "web_app":
          markup.webApp(button.text, button.webAppUrl);
          break;
        case "copy_text":
          markup.copyText(button.text, button.copyText);
          break;
        case "switch_inline":
          markup.switchInline(button.text, button.switchInlineQuery);
          break;
        default:
          markup.text(button.text, formatCallbackData(nodeId, button.id));
      }
    });

    if (rowIndex < keyboard.rows.length - 1) {
      markup.row();
    }
  });

  return markup;
}

function buildReplyKeyboard(keyboard: Extract<MessageKeyboard, { type: "reply" }>) {
  const markup = new Keyboard();

  keyboard.rows.forEach((row, rowIndex) => {
    row.forEach((button) => {
      switch (button.kind) {
        case "request_contact":
          markup.requestContact(button.text);
          break;
        case "request_location":
          markup.requestLocation(button.text);
          break;
        default:
          markup.text(button.text);
      }
    });

    if (rowIndex < keyboard.rows.length - 1) {
      markup.row();
    }
  });

  if (keyboard.resize) {
    markup.resized();
  }

  if (keyboard.oneTime) {
    markup.oneTime();
  }

  return markup;
}

async function resolveMediaSource(
  projectId: string,
  attachment: MessageAttachment,
): Promise<string | InputFile> {
  const asset = await getProjectAsset(projectId, attachment.assetId);
  if (!asset) {
    throw new Error("Вложение не найдено");
  }

  if (asset.telegramFileId) {
    return asset.telegramFileId;
  }

  const buffer = await readAssetBuffer(projectId, attachment.assetId);
  if (!buffer) {
    throw new Error("Файл вложения недоступен");
  }

  return new InputFile(buffer, asset.fileName);
}

async function cacheTelegramFileId(attachment: MessageAttachment, fileId: string | undefined) {
  if (!fileId) {
    return;
  }

  await updateAssetTelegramFileId(attachment.assetId, fileId);
}

export async function sendOutboundMessage(
  ctx: Context,
  projectId: string,
  nodeId: string,
  payload: OutboundMessagePayload,
): Promise<SendOutboundResult> {
  const chatId = ctx.chat?.id;
  if (chatId == null) {
    return {};
  }

  return sendOutboundMessageToChat(ctx.api, chatId, projectId, nodeId, payload);
}

export async function sendOutboundMessageToChat(
  api: Api<RawApi>,
  chatId: number,
  projectId: string,
  nodeId: string,
  payload: OutboundMessagePayload,
): Promise<SendOutboundResult> {
  await recordBotEvent(projectId, {
    type: "message_out",
    chatId,
    nodeId,
  });

  const common = buildCommonOptions(payload);
  let replyMarkup: InlineKeyboard | Keyboard | undefined;

  if (payload.keyboard?.type === "inline") {
    replyMarkup = buildInlineKeyboard(nodeId, payload.keyboard);
  } else if (payload.keyboard?.type === "reply") {
    replyMarkup = buildReplyKeyboard(payload.keyboard);
  }

  const attachments = payload.attachments ?? [];
  const text = payload.text?.trim() ?? "";

  if (attachments.length === 0) {
    if (payload.keyboard?.type === "remove") {
      await api.sendMessage(chatId, text || " ", {
        ...common,
        reply_markup: { remove_keyboard: true },
      });
      return {};
    }

    if (!text) {
      return {};
    }

    await api.sendMessage(chatId, text, {
      ...common,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });

    return buildReplySession(nodeId, payload.keyboard);
  }

  if (attachments.length === 1) {
    const attachment = attachments[0];
    const source = await resolveMediaSource(projectId, attachment);
    const caption = text || undefined;

    if (attachment.kind === "photo") {
      const message = await api.sendPhoto(chatId, source, {
        ...common,
        caption,
        ...(attachment.hasSpoiler ? { has_spoiler: true } : {}),
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      await cacheTelegramFileId(attachment, message.photo?.at(-1)?.file_id);
    } else if (attachment.kind === "video") {
      const cover = attachment.coverAssetId
        ? await resolveMediaSource(projectId, {
            id: `${attachment.id}-cover`,
            kind: "photo",
            assetId: attachment.coverAssetId,
          })
        : undefined;
      const message = await api.sendVideo(chatId, source, {
        ...common,
        caption,
        ...(cover ? { cover } : {}),
        ...(attachment.hasSpoiler ? { has_spoiler: true } : {}),
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      await cacheTelegramFileId(attachment, message.video?.file_id);
    } else if (attachment.kind === "document") {
      const message = await api.sendDocument(chatId, source, {
        ...common,
        caption,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      await cacheTelegramFileId(attachment, message.document?.file_id);
    } else if (attachment.kind === "audio") {
      const message = await api.sendAudio(chatId, source, {
        ...common,
        caption,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      await cacheTelegramFileId(attachment, message.audio?.file_id);
    } else {
      const message = await api.sendVideoNote(chatId, source, {
        ...(!text && replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      await cacheTelegramFileId(attachment, message.video_note?.file_id);

      if (text) {
        await api.sendMessage(chatId, text, {
          ...common,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
      }
    }

    return buildReplySession(nodeId, payload.keyboard);
  }

  if (attachments.every((item) => item.kind === "audio")) {
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const source = await resolveMediaSource(projectId, attachment);
      const itemCaption = index === 0 ? text || undefined : undefined;
      const isLast = index === attachments.length - 1;
      const message = await api.sendAudio(chatId, source, {
        ...common,
        caption: itemCaption,
        ...(isLast && replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      await cacheTelegramFileId(attachment, message.audio?.file_id);
    }

    return buildReplySession(nodeId, payload.keyboard);
  }

  const caption = text || undefined;
  const media = await Promise.all(
    attachments.map(async (attachment, index) => {
      const source = await resolveMediaSource(projectId, attachment);
      const itemCaption = index === 0 ? caption : undefined;

      if (attachment.kind === "photo") {
        return {
          type: "photo" as const,
          media: source,
          ...(attachment.hasSpoiler ? { has_spoiler: true } : {}),
          ...(itemCaption
            ? {
                caption: itemCaption,
                ...(common.parse_mode ? { parse_mode: common.parse_mode } : {}),
              }
            : {}),
          ...(index === 0 && common.show_caption_above_media
            ? { show_caption_above_media: true }
            : {}),
        };
      }

      if (attachment.kind === "video") {
        return {
          type: "video" as const,
          media: source,
          ...(attachment.hasSpoiler ? { has_spoiler: true } : {}),
          ...(itemCaption
            ? {
                caption: itemCaption,
                ...(common.parse_mode ? { parse_mode: common.parse_mode } : {}),
              }
            : {}),
          ...(index === 0 && common.show_caption_above_media
            ? { show_caption_above_media: true }
            : {}),
        };
      }

      return {
        type: "document" as const,
        media: source,
        ...(itemCaption
          ? {
              caption: itemCaption,
              ...(common.parse_mode ? { parse_mode: common.parse_mode } : {}),
            }
          : {}),
      };
    }),
  );

  const messages = await api.sendMediaGroup(chatId, media);

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const message = messages[index];

    if (attachment.kind === "photo" && "photo" in message) {
      await cacheTelegramFileId(attachment, message.photo?.at(-1)?.file_id);
    } else if (attachment.kind === "video" && "video" in message) {
      await cacheTelegramFileId(attachment, message.video?.file_id);
    } else if (attachment.kind === "document" && "document" in message) {
      await cacheTelegramFileId(attachment, message.document?.file_id);
    }
  }

  if (replyMarkup || payload.keyboard?.type === "remove") {
    if (text && !caption) {
      await api.sendMessage(chatId, text, {
        ...common,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    } else if (replyMarkup) {
      await api.sendMessage(chatId, " ", {
        ...common,
        reply_markup: replyMarkup,
      });
    }
  }

  return buildReplySession(nodeId, payload.keyboard);
}

function buildReplySession(
  nodeId: string,
  keyboard: MessageKeyboard | undefined,
): SendOutboundResult {
  if (keyboard?.type !== "reply") {
    return {};
  }

  return {
    replyKeyboardSession: {
      nodeId,
      buttons: keyboard.rows.flat().map((button) => ({
        id: button.id,
        text: button.text,
        kind: button.kind,
      })),
    },
  };
}
