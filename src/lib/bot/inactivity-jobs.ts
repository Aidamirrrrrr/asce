import { Bot } from "grammy";
import type { ExecutionContext } from "@/lib/bot/execution-context";
import { executeFlowFromInactivityTrigger } from "@/lib/bot/flow-executor";
import { clearInputWaitSession, setInputWaitSession } from "@/lib/bot/input-wait-session";
import { requireDecryptedBotToken } from "@/lib/bot/project-token";
import { clearReplyKeyboardSession, setReplyKeyboardSession } from "@/lib/bot/reply-session";
import type { ScheduledJobContext } from "@/lib/bot/scheduled-jobs";
import { sendOutboundMessageToChat } from "@/lib/bot/send-message";
import {
  checkChatMembership,
  evaluateConditionRules,
  type MembershipCheckCache,
} from "@/lib/bot/telegram-conditions";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import type { BotFlowDocument, TriggerNodeData } from "@/lib/flow/flow-schema";
import { loadFlowDocument } from "@/lib/flow/load-flow-document";
import { normalizeTriggerNodeData } from "@/lib/flow/trigger-node-utils";

export type InactivityJobContext = ScheduledJobContext & {
  kind: "inactivity";
  triggerNodeId: string;
};

export function isInactivityJobContext(
  context: ScheduledJobContext,
): context is InactivityJobContext {
  return context.kind === "inactivity" && typeof context.triggerNodeId === "string";
}

function inactivityDelaySeconds(hours: number): number {
  return Math.min(7 * 24 * 60 * 60, Math.max(3600, Math.round(hours * 3600)));
}

export async function cancelPendingInactivityJobs(
  projectId: string,
  chatId: number,
): Promise<void> {
  const pending = await db.scheduledFlowJob.findMany({
    where: {
      projectId,
      chatId: String(chatId),
      status: "pending",
    },
  });

  const ids = pending
    .filter((job) => {
      try {
        const parsed = JSON.parse(job.contextJson) as { kind?: string };
        return parsed.kind === "inactivity";
      } catch {
        return false;
      }
    })
    .map((job) => job.id);

  if (ids.length === 0) {
    return;
  }

  await db.scheduledFlowJob.updateMany({
    where: { id: { in: ids } },
    data: { status: "cancelled" },
  });
}

export async function syncInactivityJobs(input: {
  projectId: string;
  chatId: number;
  flow: BotFlowDocument;
  executionContext: ExecutionContext;
}): Promise<void> {
  await cancelPendingInactivityJobs(input.projectId, input.chatId);

  for (const node of input.flow.nodes) {
    if (node.type !== "trigger") {
      continue;
    }

    const data = normalizeTriggerNodeData(node.data as TriggerNodeData);
    if (data.triggerType !== "inactivity") {
      continue;
    }

    const runAt = new Date(Date.now() + inactivityDelaySeconds(data.inactivityHours ?? 24) * 1000);
    const context: InactivityJobContext = {
      kind: "inactivity",
      triggerNodeId: node.id,
      executionContext: input.executionContext,
      userMessage: "",
    };

    await db.scheduledFlowJob.create({
      data: {
        projectId: input.projectId,
        chatId: String(input.chatId),
        nodeId: node.id,
        contextJson: JSON.stringify(context),
        runAt,
        status: "pending",
      },
    });
  }
}

export async function processInactivityJob(job: {
  id: string;
  projectId: string;
  chatId: string;
  nodeId: string;
  contextJson: string;
}): Promise<void> {
  const rawContext = JSON.parse(job.contextJson) as ScheduledJobContext;
  if (!isInactivityJobContext(rawContext)) {
    throw new Error("Некорректный контекст триггера бездействия");
  }

  const project = await db.project.findUnique({ where: { id: job.projectId } });
  if (!project?.botToken || project.runtimeStatus !== "running") {
    throw new Error("Бот не запущен");
  }

  const flow = loadFlowDocument(project.flowJson, createDefaultFlow());
  const triggerNode = flow.nodes.find((node) => node.id === rawContext.triggerNodeId);
  if (!triggerNode || triggerNode.type !== "trigger") {
    throw new Error("Триггер бездействия не найден");
  }

  const triggerData = normalizeTriggerNodeData(triggerNode.data as TriggerNodeData);
  if (triggerData.triggerType !== "inactivity") {
    throw new Error("Нода больше не является триггером бездействия");
  }

  const chatId = Number(job.chatId);
  const bot = new Bot(requireDecryptedBotToken(project));
  const membershipCache: MembershipCheckCache = new Map();
  const userId = rawContext.executionContext.userId;

  const port = {
    executionContext: rawContext.executionContext,
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

      return evaluateConditionRules(data, rawContext.executionContext, (targetChatId) =>
        checkChatMembership(bot.api, targetChatId, userId, membershipCache),
      );
    },
  };

  const walkResult = await executeFlowFromInactivityTrigger(flow, rawContext.triggerNodeId, port);

  if (walkResult?.inputWaitSession) {
    await setInputWaitSession(job.projectId, chatId, walkResult.inputWaitSession);
    await clearReplyKeyboardSession(job.projectId, chatId);
  } else if (walkResult?.replyKeyboardSession) {
    await setReplyKeyboardSession(job.projectId, chatId, walkResult.replyKeyboardSession);
    await clearInputWaitSession(job.projectId, chatId);
  }

  await db.scheduledFlowJob.update({
    where: { id: job.id },
    data: { status: "done", lastError: null },
  });
}
