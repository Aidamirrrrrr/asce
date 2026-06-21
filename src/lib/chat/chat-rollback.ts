import { createEmptyFlow } from "@/lib/flow/default-flow";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import type { ProjectChatMessage } from "@/lib/projects";
import { createChatMessage } from "@/lib/projects";

const EPHEMERAL_MESSAGE_IDS = new Set([
  "streaming-user",
  "streaming-build-plan",
  "streaming-assistant",
]);

export function isEphemeralChatMessage(message: ProjectChatMessage): boolean {
  return EPHEMERAL_MESSAGE_IDS.has(message.id) || Boolean(message.meta?.streaming);
}

export function canRollbackToMessage(
  messages: ProjectChatMessage[],
  messageId: string,
): boolean {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) {
    return false;
  }

  const target = messages[index];
  if (!target || isEphemeralChatMessage(target) || target.meta?.buildPlan) {
    return false;
  }

  return index < messages.length - 1;
}

export function truncateChatToMessage(
  messages: ProjectChatMessage[],
  messageId: string,
): ProjectChatMessage[] | null {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) {
    return null;
  }

  return messages.slice(0, index + 1);
}

export function resolveFlowSnapshotAtIndex(
  messages: ProjectChatMessage[],
  targetIndex: number,
): BotFlowDocument | null {
  const target = messages[targetIndex];
  if (!target) {
    return null;
  }

  if (target.role === "user" && target.meta?.flowSnapshot) {
    return target.meta.flowSnapshot;
  }

  if (
    target.role === "assistant" &&
    target.meta?.flowSnapshot &&
    !target.meta?.buildPlan
  ) {
    return target.meta.flowSnapshot;
  }

  for (let index = targetIndex; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (message.role === "user" && message.meta?.flowSnapshot) {
      return message.meta.flowSnapshot;
    }

    if (
      message.role === "assistant" &&
      message.meta?.flowSnapshot &&
      !message.meta?.buildPlan
    ) {
      return message.meta.flowSnapshot;
    }
  }

  return null;
}

export function resolveRollbackState(
  messages: ProjectChatMessage[],
  messageId: string,
  fallbackFlow: BotFlowDocument = createEmptyFlow(),
): { messages: ProjectChatMessage[]; flow: BotFlowDocument } | null {
  const truncated = truncateChatToMessage(messages, messageId);
  if (!truncated) {
    return null;
  }

  const targetIndex = truncated.length - 1;
  const snapshot = resolveFlowSnapshotAtIndex(truncated, targetIndex);

  return {
    messages: truncated,
    flow: snapshot ?? fallbackFlow,
  };
}

export function withFlowSnapshot(
  message: ProjectChatMessage,
  flow: BotFlowDocument,
): ProjectChatMessage {
  return {
    ...message,
    meta: {
      ...message.meta,
      flowSnapshot: flow,
    },
  };
}

export function createAssistantMessageWithFlowSnapshot(
  content: string,
  flow: BotFlowDocument,
  meta?: ProjectChatMessage["meta"],
): ProjectChatMessage {
  return createChatMessage("assistant", content, undefined, {
    ...meta,
    flowSnapshot: flow,
  });
}
