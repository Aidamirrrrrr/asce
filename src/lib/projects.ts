import type { Project } from "@/generated/prisma/client";

import { buildWebhookUrl } from "@/lib/bot/config";
import { decryptBotTokenFromStorage } from "@/lib/bot/project-token";

import type { ChatBuildPlanState } from "@/lib/chat/build-plan-message";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { parseFlowJson } from "@/lib/flow/flow-schema";
import { createEmptyFlow } from "@/lib/flow/default-flow";

export type DeliveryMode = "webhook" | "polling";
export type RuntimeStatus = "stopped" | "running" | "error";

export type ChatActionOption = {
  id: string;
  label: string;
  variant?: "default" | "destructive" | "outline";
};

/** Динамическая карточка в чате: подтверждение, выбор, просмотр данных от агента. */
export type ChatPendingAction = {
  type: "delete_records";
  params: {
    days?: number;
    collection?: string;
  };
};

export type ChatActionCard = {
  title?: string;
  description?: string;
  body?: string;
  actions: ChatActionOption[];
  status?: "pending" | "resolved";
  resolvedActionId?: string;
  pendingAction?: ChatPendingAction;
};

export type ProjectChatMessageMeta = {
  stepLimitReached?: boolean;
  actionCard?: ChatActionCard;
  buildPlan?: ChatBuildPlanState;
  /** Клиентский флаг: ответ ассистента ещё дописывается по токенам. */
  streaming?: boolean;
  /** Снимок сценария после этого хода (для отката чата). */
  flowSnapshot?: BotFlowDocument;
};

export type ProjectChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: ProjectChatMessageMeta;
};

export function createChatMessage(
  role: ProjectChatMessage["role"],
  content: string,
  id?: string,
  meta?: ProjectChatMessageMeta,
): ProjectChatMessage {
  return {
    id: id ?? `${role}-${crypto.randomUUID()}`,
    role,
    content: content.trim(),
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  };
}

export function clearStepLimitMeta(message: ProjectChatMessage): ProjectChatMessage {
  if (!message.meta?.stepLimitReached) {
    return message;
  }

  const { stepLimitReached: _removed, ...restMeta } = message.meta;
  return {
    ...message,
    meta: Object.keys(restMeta).length > 0 ? restMeta : undefined,
  };
}

function parseChatMessageMeta(meta: unknown): ProjectChatMessageMeta | undefined {
  if (!meta || typeof meta !== "object") {
    return undefined;
  }

  const raw = meta as ProjectChatMessageMeta;
  const parsed: ProjectChatMessageMeta = {};

  if (raw.stepLimitReached === true) {
    parsed.stepLimitReached = true;
  }

  if (raw.streaming === true) {
    parsed.streaming = true;
  }

  if (raw.actionCard && typeof raw.actionCard === "object") {
    const card = raw.actionCard;
    if (Array.isArray(card.actions) && card.actions.length > 0) {
      parsed.actionCard = {
        ...(typeof card.title === "string" ? { title: card.title } : {}),
        ...(typeof card.description === "string" ? { description: card.description } : {}),
        ...(typeof card.body === "string" ? { body: card.body } : {}),
        actions: card.actions
          .filter((action): action is ChatActionOption =>
            Boolean(
              action &&
                typeof action === "object" &&
                typeof action.id === "string" &&
                typeof action.label === "string",
            ),
          )
          .map((action) => ({
            id: action.id,
            label: action.label,
            ...(action.variant === "destructive" ||
            action.variant === "outline" ||
            action.variant === "default"
              ? { variant: action.variant }
              : {}),
          })),
        ...(card.status === "pending" || card.status === "resolved" ? { status: card.status } : {}),
        ...(typeof card.resolvedActionId === "string"
          ? { resolvedActionId: card.resolvedActionId }
          : {}),
        ...(card.pendingAction?.type === "delete_records"
          ? {
              pendingAction: {
                type: "delete_records" as const,
                params: {
                  ...(typeof card.pendingAction.params?.days === "number"
                    ? { days: card.pendingAction.params.days }
                    : {}),
                  ...(typeof card.pendingAction.params?.collection === "string"
                    ? { collection: card.pendingAction.params.collection }
                    : {}),
                },
              },
            }
          : {}),
      };
    }
  }

  if (raw.buildPlan && typeof raw.buildPlan === "object") {
    const plan = raw.buildPlan as ChatBuildPlanState;
    if (
      Array.isArray(plan.items) &&
      plan.items.every((item) => typeof item === "string") &&
      (plan.status === "active" || plan.status === "complete")
    ) {
      parsed.buildPlan = {
        items: plan.items,
        done: Array.isArray(plan.done)
          ? plan.done.filter((index): index is number => typeof index === "number")
          : [],
        nodeCount: typeof plan.nodeCount === "number" ? plan.nodeCount : 0,
        status: plan.status,
        ...(typeof plan.statusLabel === "string" ? { statusLabel: plan.statusLabel } : {}),
      };
    }
  }

  if (raw.flowSnapshot && typeof raw.flowSnapshot === "object") {
    parsed.flowSnapshot = parseFlowJson(JSON.stringify(raw.flowSnapshot), createEmptyFlow());
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

export function parseChatJson(raw: string | null | undefined): ProjectChatMessage[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item): ProjectChatMessage | null => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const message = item as Partial<ProjectChatMessage>;
        const meta = parseChatMessageMeta(message.meta);
        const hasBuildPlan = Boolean(meta?.buildPlan);
        if (
          typeof message.id !== "string" ||
          (message.role !== "user" && message.role !== "assistant") ||
          typeof message.content !== "string" ||
          !(message.content.trim() || hasBuildPlan)
        ) {
          return null;
        }

        return {
          id: message.id,
          role: message.role,
          content: message.content,
          ...(meta ? { meta } : {}),
        };
      })
      .filter((message): message is ProjectChatMessage => message !== null);
  } catch {
    return [];
  }
}

export function serializeChatJson(messages: ProjectChatMessage[]): string {
  return JSON.stringify(messages);
}

export type ProjectSummary = Pick<
  Project,
  | "id"
  | "name"
  | "description"
  | "status"
  | "prompt"
  | "deliveryMode"
  | "runtimeStatus"
  | "lastError"
  | "lastStartedAt"
  | "createdAt"
  | "updatedAt"
> & {
  hasBotToken: boolean;
  botTokenMasked: string | null;
};

export type ProjectDetail = ProjectSummary & {
  flowJson: string | null;
  chatJson: string | null;
  messages: ProjectChatMessage[];
  webhookUrl: string | null;
  webhookConfigError: string | null;
};

export function resolveWebhookConfig(project: Pick<Project, "id" | "webhookSecret">): {
  webhookUrl: string | null;
  webhookConfigError: string | null;
} {
  try {
    if (!project.webhookSecret) {
      throw new Error("Секрет webhook ещё не сгенерирован");
    }

    return {
      webhookUrl: buildWebhookUrl(project.id, project.webhookSecret),
      webhookConfigError: null,
    };
  } catch (error) {
    return {
      webhookUrl: null,
      webhookConfigError: error instanceof Error ? error.message : "Webhook не настроен",
    };
  }
}

export function maskBotToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }

  if (token.length <= 12) {
    return "••••••••";
  }

  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export function projectNameFromPrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "Бот без названия";
  }

  const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() ?? trimmed;
  const name = firstSentence.length > 48 ? `${firstSentence.slice(0, 45).trim()}…` : firstSentence;

  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function formatProjectStatus(status: string): string {
  switch (status) {
    case "draft":
      return "Черновик";
    case "active":
      return "Активен";
    default:
      return status;
  }
}

export function formatRuntimeStatus(status: string): string {
  switch (status) {
    case "stopped":
      return "Остановлен";
    case "running":
      return "Запущен";
    case "error":
      return "Ошибка";
    default:
      return status;
  }
}

export function serializeProject(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    prompt: project.prompt,
    deliveryMode: project.deliveryMode,
    runtimeStatus: project.runtimeStatus,
    lastError: project.lastError,
    lastStartedAt: project.lastStartedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    hasBotToken: Boolean(project.botToken),
    botTokenMasked: maskBotToken(decryptBotTokenFromStorage(project.botToken)),
  };
}

export function serializeProjectDetail(
  project: Project,
  messages: ProjectChatMessage[] = parseChatJson(project.chatJson),
): ProjectDetail {
  const webhook = resolveWebhookConfig(project);

  return {
    ...serializeProject(project),
    flowJson: project.flowJson,
    chatJson: project.chatJson,
    messages,
    webhookUrl: webhook.webhookUrl,
    webhookConfigError: webhook.webhookConfigError,
  };
}
