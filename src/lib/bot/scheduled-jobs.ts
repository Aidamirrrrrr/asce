import { Bot } from "grammy";

import type { ExecutionContext } from "@/lib/bot/execution-context";
import { buildMessageOutboundPayload, executeFlowFromMessageNext } from "@/lib/bot/flow-executor";
import { isInactivityJobContext, processInactivityJob } from "@/lib/bot/inactivity-jobs";
import { clearInputWaitSession, setInputWaitSession } from "@/lib/bot/input-wait-session";
import { requireDecryptedBotToken } from "@/lib/bot/project-token";
import { setReplyKeyboardSession } from "@/lib/bot/reply-session";
import { sendOutboundMessageToChat } from "@/lib/bot/send-message";
import {
  checkChatMembership,
  evaluateConditionRules,
  type MembershipCheckCache,
} from "@/lib/bot/telegram-conditions";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { loadFlowDocument } from "@/lib/flow/load-flow-document";
import { normalizeMessageNodeData } from "@/lib/flow/message-node-utils";

export const MAX_MESSAGE_DELAY_SECONDS = 7 * 24 * 60 * 60;

export type ScheduledJobContext = {
  kind?: "message" | "inactivity";
  executionContext: ExecutionContext;
  userMessage: string;
  triggerNodeId?: string;
};

export async function enqueueMessageJob(input: {
  projectId: string;
  chatId: number;
  nodeId: string;
  delaySeconds: number;
  context: ScheduledJobContext;
}) {
  const delaySeconds = Math.min(
    MAX_MESSAGE_DELAY_SECONDS,
    Math.max(1, Math.floor(input.delaySeconds)),
  );
  const runAt = new Date(Date.now() + delaySeconds * 1000);

  await db.scheduledFlowJob.create({
    data: {
      projectId: input.projectId,
      chatId: String(input.chatId),
      nodeId: input.nodeId,
      contextJson: JSON.stringify({
        kind: "message",
        ...input.context,
      } satisfies ScheduledJobContext),
      runAt,
      status: "pending",
    },
  });
}

async function claimNextDueJob() {
  return db.$transaction(async (tx) => {
    const job = await tx.scheduledFlowJob.findFirst({
      where: {
        status: "pending",
        runAt: { lte: new Date() },
      },
      orderBy: { runAt: "asc" },
    });

    if (!job) {
      return null;
    }

    const claim = await tx.scheduledFlowJob.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "running" },
    });

    if (claim.count === 0) {
      return null;
    }

    return job;
  });
}

function parseJobContext(contextJson: string): ScheduledJobContext | null {
  try {
    const parsed = JSON.parse(contextJson) as Partial<ScheduledJobContext>;
    if (
      !parsed.executionContext ||
      typeof parsed.executionContext.projectId !== "string" ||
      typeof parsed.executionContext.chatId !== "number" ||
      typeof parsed.executionContext.userId !== "number" ||
      !parsed.executionContext.vars ||
      typeof parsed.userMessage !== "string"
    ) {
      return null;
    }

    return {
      kind: parsed.kind === "inactivity" ? "inactivity" : "message",
      executionContext: parsed.executionContext,
      userMessage: parsed.userMessage,
      ...(typeof parsed.triggerNodeId === "string" ? { triggerNodeId: parsed.triggerNodeId } : {}),
    };
  } catch {
    return null;
  }
}

export async function processScheduledJob(jobId: string): Promise<void> {
  const job = await db.scheduledFlowJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "running") {
    return;
  }

  try {
    const context = parseJobContext(job.contextJson);
    if (!context) {
      throw new Error("Некорректный контекст отложенной задачи");
    }

    if (isInactivityJobContext(context)) {
      await processInactivityJob(job);
      return;
    }

    const project = await db.project.findUnique({ where: { id: job.projectId } });
    if (!project?.botToken || project.runtimeStatus !== "running") {
      throw new Error("Бот не запущен");
    }

    const flow = loadFlowDocument(project.flowJson, createDefaultFlow());
    const messageNode = flow.nodes.find(
      (node) => node.id === job.nodeId && node.type === "message",
    );
    if (!messageNode || messageNode.type !== "message") {
      throw new Error("Нода сообщения не найдена");
    }

    const messageData = normalizeMessageNodeData(messageNode.data);
    const chatId = Number(job.chatId);
    const bot = new Bot(requireDecryptedBotToken(project));

    if (messageData.showTyping) {
      await bot.api.sendChatAction(chatId, "typing");
    }

    const payload = buildMessageOutboundPayload(messageData, context.executionContext);

    const membershipCache: MembershipCheckCache = new Map();
    const userId = context.executionContext.userId;

    const port = {
      executionContext: context.executionContext,
      sendText: async (text: string) => {
        await bot.api.sendMessage(chatId, text);
      },
      sendMessage: async (
        outboundPayload: Parameters<typeof sendOutboundMessageToChat>[4],
        messageContext: { nodeId: string },
      ) =>
        sendOutboundMessageToChat(
          bot.api,
          chatId,
          project.id,
          messageContext.nodeId,
          outboundPayload,
        ),
      evaluateCondition: async (data: import("@/lib/flow/flow-schema").ConditionNodeData) => {
        if (!userId) {
          return false;
        }

        return evaluateConditionRules(data, context.executionContext, (targetChatId) =>
          checkChatMembership(bot.api, targetChatId, userId, membershipCache),
        );
      },
    };

    const sendResult = await port.sendMessage(payload, { nodeId: job.nodeId });

    if (sendResult.replyKeyboardSession) {
      await setReplyKeyboardSession(job.projectId, chatId, sendResult.replyKeyboardSession);
      await clearInputWaitSession(job.projectId, chatId);
    }

    const walkResult = await executeFlowFromMessageNext(
      flow,
      job.nodeId,
      context.userMessage,
      port,
    );

    if (walkResult?.inputWaitSession) {
      await setInputWaitSession(job.projectId, chatId, walkResult.inputWaitSession);
    } else if (walkResult?.replyKeyboardSession) {
      await setReplyKeyboardSession(job.projectId, chatId, walkResult.replyKeyboardSession);
      await clearInputWaitSession(job.projectId, chatId);
    }

    await db.scheduledFlowJob.update({
      where: { id: job.id },
      data: { status: "done", lastError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка отложенной отправки";
    await db.scheduledFlowJob.update({
      where: { id: job.id },
      data: { status: "failed", lastError: message },
    });
  }
}

export async function processDueJobs(): Promise<number> {
  let processed = 0;

  for (;;) {
    const job = await claimNextDueJob();
    if (!job) {
      break;
    }

    await processScheduledJob(job.id);
    processed += 1;
  }

  return processed;
}
