import {
  buildSessionKey,
  deleteJsonSession,
  getJsonSession,
  setJsonSession,
} from "@/lib/bot/session-store";

const PREFIX = "session:reply-kb";

export type ReplyKeyboardSession = {
  nodeId: string;
  buttons: {
    id: string;
    text: string;
    kind: "text" | "request_contact" | "request_location";
  }[];
};

function key(projectId: string, chatId: number): string {
  return buildSessionKey(PREFIX, projectId, chatId);
}

export async function setReplyKeyboardSession(
  projectId: string,
  chatId: number,
  session: ReplyKeyboardSession | null,
): Promise<void> {
  await setJsonSession(key(projectId, chatId), session);
}

export async function getReplyKeyboardSession(
  projectId: string,
  chatId: number,
): Promise<ReplyKeyboardSession | null> {
  return getJsonSession<ReplyKeyboardSession>(key(projectId, chatId));
}

export async function clearReplyKeyboardSession(projectId: string, chatId: number): Promise<void> {
  await deleteJsonSession(key(projectId, chatId));
}
