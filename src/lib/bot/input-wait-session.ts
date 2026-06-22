import {
  buildSessionKey,
  deleteJsonSession,
  getJsonSession,
  setJsonSession,
} from "@/lib/bot/session-store";

const PREFIX = "session:input-wait";

export type InputWaitSession = {
  nodeId: string;
  variableKey: string;
  /** Если задано — это шаг формы. После сохранения ответа нужно задать вопрос с этим индексом. */
  formNextQuestionIndex?: number;
};

function key(projectId: string, chatId: number): string {
  return buildSessionKey(PREFIX, projectId, chatId);
}

export async function setInputWaitSession(
  projectId: string,
  chatId: number,
  session: InputWaitSession | null,
): Promise<void> {
  await setJsonSession(key(projectId, chatId), session);
}

export async function getInputWaitSession(
  projectId: string,
  chatId: number,
): Promise<InputWaitSession | null> {
  return getJsonSession<InputWaitSession>(key(projectId, chatId));
}

export async function clearInputWaitSession(projectId: string, chatId: number): Promise<void> {
  await deleteJsonSession(key(projectId, chatId));
}
