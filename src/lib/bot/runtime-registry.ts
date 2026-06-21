import { Bot, GrammyError } from "grammy";

import type { Project } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { loadFlowDocument } from "@/lib/flow/load-flow-document";
import { logger } from "@/lib/logger";

import { isPollingDelegatedToWorker, shouldRunPollingInThisProcess } from "./bot-runtime-mode";
import { buildWebhookUrl, getAppUrl, resolveDeliveryMode } from "./config";
import { createProjectBot } from "./create-project-bot";
import { collectRequiredSecretKeys, flowHasTrigger } from "./flow-executor";
import { clearTelegramWebhook, haltPollingBot, runPollingBot } from "./polling-runtime";
import { markProjectError, markProjectStopped } from "./project-runtime-status";
import { findMissingRequiredSecrets } from "./project-secrets";
import { requireDecryptedBotToken, withDecryptedBotToken } from "./project-token";
import { formatTelegramBotApiError } from "./telegram-api-errors";
import { ensureProjectWebhookSecret } from "./webhook-secret";

type RuntimeRegistryGlobal = typeof globalThis & {
  __botRuntimeStartLocks?: Map<string, Promise<void>>;
};

function getStartLocks(): Map<string, Promise<void>> {
  const globalStore = globalThis as RuntimeRegistryGlobal;
  if (!globalStore.__botRuntimeStartLocks) {
    globalStore.__botRuntimeStartLocks = new Map();
  }

  return globalStore.__botRuntimeStartLocks;
}

export async function stopProjectBot(project: Pick<Project, "id" | "botToken">): Promise<void> {
  if (shouldRunPollingInThisProcess()) {
    await haltPollingBot(project.id);
  }

  const cleanupToken =
    project.botToken && !(isPollingDelegatedToWorker() && !shouldRunPollingInThisProcess());

  if (cleanupToken && project.botToken) {
    const bot = new Bot(requireDecryptedBotToken(project));
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: true });
    } catch {
      // Webhook may not be set.
    }
  }
}

function validateProjectForStart(project: Project): void {
  if (!project.botToken) {
    throw new Error("Укажите токен бота в настройках");
  }

  const flow = loadFlowDocument(project.flowJson, createDefaultFlow());
  if (!flowHasTrigger(flow)) {
    throw new Error("В схеме должен быть хотя бы один триггер");
  }
}

async function validateProjectSecretsForStart(project: Project): Promise<void> {
  const flow = loadFlowDocument(project.flowJson, createDefaultFlow());
  const requiredKeys = collectRequiredSecretKeys(flow);
  const missing = await findMissingRequiredSecrets(project.id, requiredKeys);

  if (missing.length > 0) {
    throw new Error(`Заполните секреты в настройках: ${missing.join(", ")}`);
  }
}

function assertWebhookAppUrl(): void {
  const appUrl = getAppUrl();
  if (!appUrl.startsWith("https://")) {
    throw new Error(
      `APP_URL должен быть публичным HTTPS (сейчас: ${appUrl}). Для webhook задайте, например, https://asce.tech`,
    );
  }
}

async function registerProjectWebhook(project: Project): Promise<void> {
  if (!project.webhookSecret) {
    throw new Error("Секрет webhook не сгенерирован");
  }

  assertWebhookAppUrl();

  const bot = createProjectBot(withDecryptedBotToken(project));
  const webhookUrl = buildWebhookUrl(project.id, project.webhookSecret);

  logger.info("bot_set_webhook_start", {
    projectId: project.id,
    appUrl: getAppUrl(),
    webhookPath: `/api/telegram/webhook/${project.id}`,
  });

  try {
    const me = await bot.api.getMe();
    await bot.api.setWebhook(webhookUrl, { drop_pending_updates: true });
    logger.info("bot_set_webhook_ok", {
      projectId: project.id,
      botUsername: me.username ?? null,
    });
  } catch (error) {
    logger.error("bot_set_webhook_failed", {
      projectId: project.id,
      message: error instanceof Error ? error.message : "unknown",
      ...(error instanceof GrammyError
        ? { grammyCode: error.error_code, grammyDescription: error.description }
        : {}),
    });
    throw new Error(formatTelegramBotApiError(error, "Не удалось зарегистрировать webhook"));
  }
}

export async function startProjectBot(project: Project): Promise<void> {
  const locks = getStartLocks();
  const previous = locks.get(project.id) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => startProjectBotInner(project))
    .finally(() => {
      if (locks.get(project.id) === run) {
        locks.delete(project.id);
      }
    });

  locks.set(project.id, run);
  await run;
}

async function startProjectBotInner(project: Project): Promise<void> {
  validateProjectForStart(project);
  await validateProjectSecretsForStart(project);

  const readyProject = await ensureProjectWebhookSecret(project);
  const mode = resolveDeliveryMode(readyProject.deliveryMode);
  const delegatedPolling =
    mode === "polling" && isPollingDelegatedToWorker() && !shouldRunPollingInThisProcess();

  if (!delegatedPolling) {
    await stopProjectBot(project);
  }

  if (mode === "polling") {
    if (shouldRunPollingInThisProcess()) {
      await runPollingBot(withDecryptedBotToken(readyProject));
    } else {
      // Снимаем webhook сразу, иначе Telegram шлёт POST на Next.js до старта воркера.
      await clearTelegramWebhook(requireDecryptedBotToken(readyProject));
    }
  } else {
    await registerProjectWebhook(readyProject);
  }

  await db.project.update({
    where: { id: readyProject.id },
    data: {
      deliveryMode: mode,
      runtimeStatus: "running",
      status: "active",
      lastError: null,
      lastStartedAt: new Date(),
    },
  });
}

export { markProjectError, markProjectStopped };
