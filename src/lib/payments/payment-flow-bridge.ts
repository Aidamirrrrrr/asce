import { Bot } from "grammy";
import { recordBotEvent } from "@/lib/bot/bot-analytics";
import { buildExecutionContextFromChat } from "@/lib/bot/build-execution-context-from-chat";
import { executeFlowFromPaymentSucceeded } from "@/lib/bot/flow-executor";
import {
  clearInputWaitSession,
  getInputWaitSession,
  setInputWaitSession,
} from "@/lib/bot/input-wait-session";
import { requireDecryptedBotToken, withDecryptedBotToken } from "@/lib/bot/project-token";
import { clearReplyKeyboardSession, setReplyKeyboardSession } from "@/lib/bot/reply-session";
import { sendOutboundMessageToChat } from "@/lib/bot/send-message";
import {
  checkChatMembership,
  evaluateConditionRules,
  type MembershipCheckCache,
} from "@/lib/bot/telegram-conditions";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { loadFlowDocument } from "@/lib/flow/load-flow-document";
import { logger } from "@/lib/logger";
import {
  extractChatAndUserFromMetadata,
  type YooKassaNotification,
} from "@/lib/payments/yookassa-webhook";

async function claimProcessedPayment(projectId: string, paymentId: string): Promise<boolean> {
  try {
    await db.processedPayment.create({
      data: {
        projectId,
        provider: "yookassa",
        paymentId,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function handleYooKassaPaymentNotification(input: {
  projectId: string;
  notification: YooKassaNotification;
}): Promise<{ ok: true; duplicate: boolean } | { ok: false; reason: string }> {
  const { projectId, notification } = input;
  const paymentId = notification.object.id;

  if (notification.event !== "payment.succeeded") {
    return { ok: true, duplicate: false };
  }

  const claimed = await claimProcessedPayment(projectId, paymentId);
  if (!claimed) {
    logger.info("yookassa_payment_duplicate", { projectId, paymentId });
    return { ok: true, duplicate: true };
  }

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project?.botToken || project.runtimeStatus !== "running") {
    return { ok: false, reason: "Бот не запущен" };
  }

  const runtimeProject = withDecryptedBotToken(project);
  const chatTarget = extractChatAndUserFromMetadata(notification.object.metadata);
  if (!chatTarget) {
    return { ok: false, reason: "В metadata платежа нужны chat_id и user_id" };
  }

  const { chatId, userId } = chatTarget;
  const flow = loadFlowDocument(project.flowJson, createDefaultFlow());
  const executionContext = await buildExecutionContextFromChat({
    projectId,
    flowJson: project.flowJson,
    chatId,
    userId,
    extraVars: {
      payment_id: paymentId,
      payment_amount: notification.object.amount?.value ?? "",
      payment_currency: notification.object.amount?.currency ?? "",
    },
  });

  await recordBotEvent(projectId, {
    type: "payment_succeeded",
    userId,
    chatId,
    meta: {
      paymentId,
      amount: notification.object.amount?.value ?? null,
      currency: notification.object.amount?.currency ?? null,
    },
  });

  const bot = new Bot(requireDecryptedBotToken(runtimeProject));
  const membershipCache: MembershipCheckCache = new Map();

  const port = {
    executionContext,
    sendText: async (text: string) => {
      await bot.api.sendMessage(chatId, text);
    },
    sendMessage: async (
      outboundPayload: Parameters<typeof sendOutboundMessageToChat>[4],
      messageContext: { nodeId: string },
    ) =>
      sendOutboundMessageToChat(bot.api, chatId, projectId, messageContext.nodeId, outboundPayload),
    evaluateCondition: async (data: import("@/lib/flow/flow-schema").ConditionNodeData) =>
      evaluateConditionRules(data, executionContext, (targetChatId) =>
        checkChatMembership(bot.api, targetChatId, userId, membershipCache),
      ),
  };

  const inputSession = await getInputWaitSession(projectId, chatId);
  if (inputSession) {
    await clearInputWaitSession(projectId, chatId);
    const { executeFlowFromInputWait } = await import("@/lib/bot/flow-executor");
    const result = await executeFlowFromInputWait(flow, inputSession, `payment:${paymentId}`, port);

    if (result?.inputWaitSession) {
      await setInputWaitSession(projectId, chatId, result.inputWaitSession);
    } else if (result?.replyKeyboardSession) {
      await setReplyKeyboardSession(projectId, chatId, result.replyKeyboardSession);
    } else {
      await clearReplyKeyboardSession(projectId, chatId);
    }

    logger.info("yookassa_payment_resumed_wait_input", { projectId, paymentId, chatId });
    return { ok: true, duplicate: false };
  }

  const walkResult = await executeFlowFromPaymentSucceeded(flow, port);
  if (walkResult?.inputWaitSession) {
    await setInputWaitSession(projectId, chatId, walkResult.inputWaitSession);
  } else if (walkResult?.replyKeyboardSession) {
    await setReplyKeyboardSession(projectId, chatId, walkResult.replyKeyboardSession);
  }

  logger.info("yookassa_payment_flow_executed", { projectId, paymentId, chatId });
  return { ok: true, duplicate: false };
}
