import {
  createChatMessage,
  type ProjectChatMessage,
  type ProjectChatMessageMeta,
} from "@/lib/projects";

export const STREAMING_ASSISTANT_MESSAGE_ID = "streaming-assistant";

export function buildStreamingAssistantMeta(): ProjectChatMessageMeta {
  return { streaming: true };
}

export function createStreamingAssistantMessage(content = ""): ProjectChatMessage {
  return createChatMessage(
    "assistant",
    content,
    STREAMING_ASSISTANT_MESSAGE_ID,
    buildStreamingAssistantMeta(),
  );
}

export function upsertStreamingAssistantMessage(
  messages: ProjectChatMessage[],
  update: { content?: string; append?: string },
): ProjectChatMessage[] {
  const existing = messages.find((message) => message.id === STREAMING_ASSISTANT_MESSAGE_ID);
  const content = update.append
    ? `${existing?.content ?? ""}${update.append}`
    : (update.content ?? existing?.content ?? "");

  const nextMessage = createStreamingAssistantMessage(content);
  if (existing) {
    return messages.map((message) =>
      message.id === STREAMING_ASSISTANT_MESSAGE_ID ? nextMessage : message,
    );
  }

  return [...messages, nextMessage];
}

export function removeStreamingAssistantMessage(
  messages: ProjectChatMessage[],
): ProjectChatMessage[] {
  return messages.filter((message) => message.id !== STREAMING_ASSISTANT_MESSAGE_ID);
}
