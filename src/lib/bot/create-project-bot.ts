import { Bot, GrammyError } from "grammy";

import type { Project } from "@/generated/prisma/client";
import {
  markBotUserBlocked,
  recordBotEvent,
  recordBotUserFromContext,
} from "@/lib/bot/bot-analytics";
import { buildExecutionContext } from "@/lib/bot/build-execution-context";
import {
  extractInboundUserText,
  formatContactForFlow,
  formatLocationForFlow,
} from "@/lib/bot/extract-user-message";
import {
  executeFlow,
  executeFlowFromCallback,
  executeFlowFromInputWait,
  executeFlowFromMessageNext,
  executeFlowFromReply,
  type FlowOutboundPort,
  type FlowWalkResult,
  findReplyButtonMatch,
} from "@/lib/bot/flow-executor";
import { syncInactivityJobs } from "@/lib/bot/inactivity-jobs";
import {
  clearInputWaitSession,
  getInputWaitSession,
  setInputWaitSession,
} from "@/lib/bot/input-wait-session";
import { isBotAdminStatus, upsertKnownChatFromContext } from "@/lib/bot/known-chats";
import { saveProjectRecord } from "@/lib/bot/project-records";
import {
  clearReplyKeyboardSession,
  getReplyKeyboardSession,
  setReplyKeyboardSession,
} from "@/lib/bot/reply-session";
import { enqueueMessageJob } from "@/lib/bot/scheduled-jobs";
import { type OutboundMessagePayload, sendOutboundMessage } from "@/lib/bot/send-message";
import {
  checkChatMembership,
  evaluateConditionRules,
  type MembershipCheckCache,
} from "@/lib/bot/telegram-conditions";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import type { ConditionNodeData } from "@/lib/flow/flow-schema";
import { loadFlowDocument } from "@/lib/flow/load-flow-document";
import { parseCallbackData } from "@/lib/flow/message-node-utils";

export function createProjectBot(project: Pick<Project, "id" | "botToken">): Bot {
  if (!project.botToken) {
    throw new Error("Токен бота не задан");
  }

  const bot = new Bot(project.botToken);

  bot.use(async (ctx, next) => {
    await upsertKnownChatFromContext(project.id, ctx);
    await recordBotUserFromContext(project.id, ctx);
    await next();
  });

  bot.on("my_chat_member", async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    await upsertKnownChatFromContext(project.id, ctx, {
      botIsAdmin: isBotAdminStatus(status),
    });
  });

  async function createOutboundPort(
    ctx: Parameters<typeof sendOutboundMessage>[0],
    flowJson: string | null | undefined,
    userMessageId?: number,
    userMessage?: string,
  ): Promise<FlowOutboundPort> {
    const executionContext = await buildExecutionContext(
      project.id,
      flowJson,
      ctx,
      userMessageId,
      userMessage,
      { includeSecrets: true },
    );
    const membershipCache: MembershipCheckCache = new Map();

    return {
      executionContext,
      flowJson,
      sendText: async (text: string) => {
        await ctx.reply(text);
      },
      sendChatAction: async (action: "typing") => {
        if (executionContext.chatId) {
          await ctx.api.sendChatAction(executionContext.chatId, action);
        }
      },
      sendMessage: async (payload: OutboundMessagePayload, context: { nodeId: string }) =>
        sendOutboundMessage(ctx, project.id, context.nodeId, payload),
      scheduleMessage: async ({ nodeId, delaySeconds, userMessage: scheduledUserMessage }) => {
        if (!executionContext.chatId) {
          return;
        }

        await enqueueMessageJob({
          projectId: project.id,
          chatId: executionContext.chatId,
          nodeId,
          delaySeconds,
          context: {
            executionContext,
            userMessage: scheduledUserMessage,
          },
        });
      },
      evaluateCondition: async (data: ConditionNodeData) => {
        if (!executionContext.userId) {
          return false;
        }

        return evaluateConditionRules(data, executionContext, (chatId) =>
          checkChatMembership(ctx.api, chatId, executionContext.userId, membershipCache),
        );
      },
      onNodeExecuted: (node) => {
        void recordBotEvent(project.id, {
          type: "node_executed",
          userId: ctx.from?.id ?? null,
          chatId: ctx.chat?.id ?? null,
          nodeId: node.id,
          meta: { nodeType: node.type },
        });
      },
      sendToChat: async (chatId: string, text: string) => {
        const numericChatId = Number(chatId);
        const target =
          Number.isFinite(numericChatId) && chatId.trim() !== "" ? numericChatId : chatId;
        await ctx.api.sendMessage(target, text);
      },
      saveRecord: async ({ collection, data }) => {
        await saveProjectRecord({
          projectId: project.id,
          collection,
          data,
          userId: ctx.from?.id ?? null,
          chatId: ctx.chat?.id ?? null,
        });
      },
    };
  }

  async function runWithErrorHandling(
    ctx: Parameters<typeof sendOutboundMessage>[0],
    action: () => Promise<void>,
  ) {
    try {
      const current = await db.project.findUnique({ where: { id: project.id } });
      if (!current || current.runtimeStatus !== "running") {
        return;
      }

      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка выполнения сценария";

      // Пользователь заблокировал бота — фиксируем это и не пишем как ошибку сценария.
      if (error instanceof GrammyError && error.error_code === 403) {
        if (ctx.chat?.id != null) {
          await markBotUserBlocked(project.id, ctx.chat.id);
        }
        return;
      }

      await db.project.update({
        where: { id: project.id },
        data: {
          lastError: message,
        },
      });

      await recordBotEvent(project.id, {
        type: "error",
        userId: ctx.from?.id ?? null,
        chatId: ctx.chat?.id ?? null,
        meta: { message },
      });

      await ctx.reply("Произошла ошибка при обработке сообщения. Попробуйте позже.");
    }
  }

  async function applyFlowWalkSessions(chatId: number, result: FlowWalkResult | undefined) {
    if (result?.inputWaitSession) {
      await setInputWaitSession(project.id, chatId, result.inputWaitSession);
      await clearReplyKeyboardSession(project.id, chatId);
      return;
    }

    if (result?.replyKeyboardSession) {
      await setReplyKeyboardSession(project.id, chatId, result.replyKeyboardSession);
      await clearInputWaitSession(project.id, chatId);
      return;
    }

    await clearInputWaitSession(project.id, chatId);
    await clearReplyKeyboardSession(project.id, chatId);
  }

  async function touchInactivityTimers(
    chatId: number,
    flow: import("@/lib/flow/flow-schema").BotFlowDocument,
    executionContext: Awaited<ReturnType<typeof buildExecutionContext>>,
  ) {
    await syncInactivityJobs({
      projectId: project.id,
      chatId,
      flow,
      executionContext,
    });
  }

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const parsed = parseCallbackData(data);

    if (!parsed) {
      await ctx.answerCallbackQuery();
      return;
    }

    await recordBotEvent(project.id, {
      type: "callback",
      userId: ctx.from?.id ?? null,
      chatId: ctx.chat?.id ?? null,
      nodeId: parsed.nodeId,
    });

    try {
      await runWithErrorHandling(ctx, async () => {
        const current = await db.project.findUnique({ where: { id: project.id } });
        if (!current) {
          return;
        }

        const flow = loadFlowDocument(current.flowJson, createDefaultFlow());
        const userMessage = ctx.callbackQuery.message?.text ?? "";
        const outboundPort = await createOutboundPort(ctx, current.flowJson, undefined, userMessage);

        const result = await executeFlowFromCallback(
          flow,
          parsed.nodeId,
          parsed.buttonId,
          userMessage,
          outboundPort,
        );

        await applyFlowWalkSessions(ctx.chat?.id ?? 0, result);

        if (ctx.chat?.id) {
          await touchInactivityTimers(ctx.chat.id, flow, outboundPort.executionContext);
        }
      });
    } finally {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  async function processInboundUserMessage(
    ctx: Parameters<typeof sendOutboundMessage>[0],
    userMessage: string,
    eventType: "message_in" | "command" = "message_in",
  ) {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    await recordBotEvent(project.id, {
      type: userMessage.startsWith("/") ? "command" : eventType,
      userId: ctx.from?.id ?? null,
      chatId,
      ...(userMessage.startsWith("/") ? { meta: { command: userMessage.split(/\s+/)[0] } } : {}),
    });

    await runWithErrorHandling(ctx, async () => {
      const current = await db.project.findUnique({ where: { id: project.id } });
      if (!current) {
        return;
      }

      const flow = loadFlowDocument(current.flowJson, createDefaultFlow());
      const outboundPort = await createOutboundPort(
        ctx,
        current.flowJson,
        ctx.message?.message_id,
        userMessage,
      );

      const inputSession = await getInputWaitSession(project.id, chatId);
      if (inputSession) {
        await clearInputWaitSession(project.id, chatId);

        const result = await executeFlowFromInputWait(
          flow,
          inputSession,
          userMessage,
          outboundPort,
        );

        await applyFlowWalkSessions(chatId, result);
        await touchInactivityTimers(chatId, flow, outboundPort.executionContext);
        return;
      }

      const replySession = await getReplyKeyboardSession(project.id, chatId);
      if (replySession) {
        const match = findReplyButtonMatch(flow, replySession.nodeId, userMessage);
        await clearReplyKeyboardSession(project.id, chatId);

        if (match) {
          const result = await executeFlowFromReply(
            flow,
            match.nodeId,
            match.buttonId,
            userMessage,
            outboundPort,
          );

          await applyFlowWalkSessions(chatId, result);
          await touchInactivityTimers(chatId, flow, outboundPort.executionContext);
          return;
        }
      }

      const { handled, replyKeyboardSession, inputWaitSession } = await executeFlow(
        flow,
        userMessage,
        outboundPort,
      );

      if (!handled) {
        if (outboundPort.executionContext.chatId) {
          await touchInactivityTimers(chatId, flow, outboundPort.executionContext);
        }
        return;
      }

      await applyFlowWalkSessions(chatId, { replyKeyboardSession, inputWaitSession });
      await touchInactivityTimers(chatId, flow, outboundPort.executionContext);
    });
  }

  bot.on("message:text", async (ctx) => {
    const messageText = ctx.message.text;
    await processInboundUserMessage(ctx, messageText);
  });

  async function handleSpecialReplyInput(
    ctx: Parameters<typeof sendOutboundMessage>[0],
    expectedKind: "request_contact" | "request_location",
  ) {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const userMessage =
      expectedKind === "request_contact" ? formatContactForFlow(ctx) : formatLocationForFlow(ctx);

    const inputSession = await getInputWaitSession(project.id, chatId);
    if (inputSession) {
      await processInboundUserMessage(ctx, userMessage);
      return;
    }

    await runWithErrorHandling(ctx, async () => {
      const replySession = await getReplyKeyboardSession(project.id, chatId);
      if (!replySession?.buttons.some((button) => button.kind === expectedKind)) {
        return;
      }

      const current = await db.project.findUnique({ where: { id: project.id } });
      if (!current) {
        return;
      }

      const flow = loadFlowDocument(current.flowJson, createDefaultFlow());
      const outboundPort = await createOutboundPort(
        ctx,
        current.flowJson,
        ctx.message?.message_id,
        userMessage,
      );
      await clearReplyKeyboardSession(project.id, chatId);

      const result = await executeFlowFromMessageNext(
        flow,
        replySession.nodeId,
        userMessage,
        outboundPort,
      );

      await applyFlowWalkSessions(chatId, result);
      await touchInactivityTimers(chatId, flow, outboundPort.executionContext);
    });
  }

  bot.on("message:contact", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const userMessage = extractInboundUserText(ctx);
    if (!userMessage) {
      return;
    }

    const replySession = await getReplyKeyboardSession(project.id, chatId);
    const wantsContactButton = replySession?.buttons.some(
      (button) => button.kind === "request_contact",
    );

    const inputSession = await getInputWaitSession(project.id, chatId);
    if (inputSession || wantsContactButton) {
      if (wantsContactButton && !inputSession) {
        await handleSpecialReplyInput(ctx, "request_contact");
        return;
      }
      await processInboundUserMessage(ctx, userMessage);
      return;
    }

    await handleSpecialReplyInput(ctx, "request_contact");
  });

  bot.on("message:location", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const userMessage = extractInboundUserText(ctx);
    if (!userMessage) {
      return;
    }

    const replySession = await getReplyKeyboardSession(project.id, chatId);
    const wantsLocationButton = replySession?.buttons.some(
      (button) => button.kind === "request_location",
    );

    const inputSession = await getInputWaitSession(project.id, chatId);
    if (inputSession || wantsLocationButton) {
      if (wantsLocationButton && !inputSession) {
        await handleSpecialReplyInput(ctx, "request_location");
        return;
      }
      await processInboundUserMessage(ctx, userMessage);
      return;
    }

    await handleSpecialReplyInput(ctx, "request_location");
  });

  return bot;
}
