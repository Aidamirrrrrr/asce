import { executeChatPendingAction } from "@/lib/chat/chat-action-handlers";
import { db } from "@/lib/db";
import {
  createChatMessage,
  type ProjectChatMessage,
  parseChatJson,
  serializeChatJson,
} from "@/lib/projects";

export async function resolveChatAction(input: {
  projectId: string;
  messageId: string;
  actionId: string;
}): Promise<{ messages: ProjectChatMessage[]; assistantMessage: string }> {
  const project = await db.project.findUnique({ where: { id: input.projectId } });
  if (!project) {
    throw new Error("Проект не найден");
  }

  const messages = parseChatJson(project.chatJson);
  const messageIndex = messages.findIndex((message) => message.id === input.messageId);
  if (messageIndex < 0) {
    throw new Error("Сообщение не найдено");
  }

  const message = messages[messageIndex]!;
  const card = message.meta?.actionCard;
  if (!card || card.status === "resolved") {
    throw new Error("Нет активной карточки действия");
  }

  const action = card.actions.find((item) => item.id === input.actionId);
  if (!action) {
    throw new Error("Неизвестное действие");
  }

  const isCancel = input.actionId === "cancel";
  let assistantMessage: string;

  if (isCancel) {
    assistantMessage = "Действие отменено.";
  } else if (!card.pendingAction) {
    assistantMessage = "Для этого действия не задан обработчик.";
  } else {
    const result = await executeChatPendingAction(input.projectId, card.pendingAction);
    assistantMessage = result.message;
  }

  const resolvedCard = {
    ...card,
    status: "resolved" as const,
    resolvedActionId: input.actionId,
  };

  const updatedMessages = messages.map((item, index) =>
    index === messageIndex
      ? {
          ...item,
          meta: {
            ...item.meta,
            actionCard: resolvedCard,
          },
        }
      : item,
  );

  const nextMessages = [...updatedMessages, createChatMessage("assistant", assistantMessage)];

  await db.project.update({
    where: { id: input.projectId },
    data: { chatJson: serializeChatJson(nextMessages) },
  });

  return { messages: nextMessages, assistantMessage };
}
