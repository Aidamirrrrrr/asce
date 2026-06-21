import { Bot } from "grammy";

import type { Project } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { loadFlowDocument } from "@/lib/flow/load-flow-document";

import { isPollingDelegatedToWorker, shouldRunPollingInThisProcess } from "./bot-runtime-mode";
import { buildWebhookUrl, type DeliveryMode } from "./config";
import { createProjectBot } from "./create-project-bot";
import { collectRequiredSecretKeys, flowHasTrigger } from "./flow-executor";
import { haltPollingBot, runPollingBot } from "./polling-runtime";
import { markProjectError, markProjectStopped } from "./project-runtime-status";
import { findMissingRequiredSecrets } from "./project-secrets";
import { requireDecryptedBotToken, withDecryptedBotToken } from "./project-token";
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
  const mode: DeliveryMode =
    process.env.NODE_ENV === "production"
      ? "webhook"
      : readyProject.deliveryMode === "polling"
        ? "polling"
        : "webhook";
  const delegatedPolling =
    mode === "polling" && isPollingDelegatedToWorker() && !shouldRunPollingInThisProcess();

  if (!delegatedPolling) {
    await stopProjectBot(project);
  }

  if (mode === "polling") {
    if (shouldRunPollingInThisProcess()) {
      await runPollingBot(withDecryptedBotToken(readyProject));
    }
  } else {
    if (!readyProject.webhookSecret) {
      throw new Error("Секрет webhook не сгенерирован");
    }

    const bot = createProjectBot(withDecryptedBotToken(readyProject));
    const webhookUrl = buildWebhookUrl(readyProject.id, readyProject.webhookSecret);
    await bot.api.setWebhook(webhookUrl, { drop_pending_updates: true });
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
