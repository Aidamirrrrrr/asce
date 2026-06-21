import type { Context } from "grammy";
import type { ExecutionContext } from "@/lib/bot/execution-context";
import { loadProjectSecrets } from "@/lib/bot/project-secrets";
import { parseStartParam } from "@/lib/bot/telegram-conditions";
import { buildTelegramVars } from "@/lib/bot/telegram-context";
import { loadUserVars } from "@/lib/bot/user-variables";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { parseFlowJson } from "@/lib/flow/flow-schema";
import { mergeTemplateVars } from "@/lib/flow/template-vars";

export async function buildExecutionContext(
  projectId: string,
  flowJson: string | null | undefined,
  ctx: Context,
  userMessageId?: number,
  userMessage?: string,
  options?: { includeSecrets?: boolean },
): Promise<ExecutionContext> {
  const userId = ctx.from?.id ?? 0;
  const flow = parseFlowJson(flowJson, createDefaultFlow());

  const [userVars, secretVars] = await Promise.all([
    loadUserVars(projectId, userId),
    options?.includeSecrets ? loadProjectSecrets(projectId) : Promise.resolve({}),
  ]);

  const defaultVars: Record<string, string> = {};
  for (const variable of flow.variables ?? []) {
    if (variable.defaultValue !== undefined) {
      defaultVars[variable.key] = variable.defaultValue;
    }
  }

  return {
    projectId,
    chatId: ctx.chat?.id ?? 0,
    userId,
    userMessageId,
    vars: {
      ...mergeTemplateVars(buildTelegramVars(ctx), userVars, secretVars, defaultVars),
      project_id: projectId,
    },
    isPremium: ctx.from?.is_premium === true,
    hasUsername: Boolean(ctx.from?.username),
    startParam: userMessage ? parseStartParam(userMessage) : undefined,
  };
}

export async function refreshExecutionContextVars(
  context: ExecutionContext,
  flowJson: string | null | undefined,
  options?: { includeSecrets?: boolean },
): Promise<ExecutionContext> {
  const [userVars, secretVars] = await Promise.all([
    loadUserVars(context.projectId, context.userId),
    options?.includeSecrets ? loadProjectSecrets(context.projectId) : Promise.resolve({}),
  ]);

  const flow = parseFlowJson(flowJson, createDefaultFlow());
  const defaultVars: Record<string, string> = {};
  for (const variable of flow.variables ?? []) {
    if (variable.defaultValue !== undefined) {
      defaultVars[variable.key] = variable.defaultValue;
    }
  }

  const telegramVars = {
    nickname: context.vars.nickname ?? "",
    first_name: context.vars.first_name ?? "",
    username: context.vars.username ?? "",
    user_id: context.vars.user_id ?? "",
  };

  return {
    ...context,
    vars: {
      ...mergeTemplateVars(telegramVars, userVars, secretVars, defaultVars),
      project_id: context.projectId,
    },
  };
}

export async function loadProjectFlowJson(projectId: string): Promise<string | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { flowJson: true },
  });

  return project?.flowJson ?? null;
}
