import type { ExecutionContext } from "@/lib/bot/execution-context";
import { loadProjectSecrets } from "@/lib/bot/project-secrets";
import { loadUserVars } from "@/lib/bot/user-variables";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { parseFlowJson } from "@/lib/flow/flow-schema";
import { mergeTemplateVars } from "@/lib/flow/template-vars";

export async function buildExecutionContextFromChat(input: {
  projectId: string;
  flowJson: string | null | undefined;
  chatId: number;
  userId: number;
  extraVars?: Record<string, string>;
}): Promise<ExecutionContext> {
  const flow = parseFlowJson(input.flowJson, createDefaultFlow());
  const [userVars, secretVars] = await Promise.all([
    loadUserVars(input.projectId, input.userId),
    loadProjectSecrets(input.projectId),
  ]);

  const defaultVars: Record<string, string> = {};
  for (const variable of flow.variables ?? []) {
    if (variable.defaultValue !== undefined) {
      defaultVars[variable.key] = variable.defaultValue;
    }
  }

  const telegramVars = {
    nickname: "",
    first_name: "",
    username: "",
    user_id: String(input.userId),
    chat_id: String(input.chatId),
  };

  return {
    projectId: input.projectId,
    chatId: input.chatId,
    userId: input.userId,
    vars: {
      ...mergeTemplateVars(telegramVars, userVars, secretVars, defaultVars),
      project_id: input.projectId,
      ...(input.extraVars ?? {}),
    },
    isPremium: false,
    hasUsername: false,
  };
}
