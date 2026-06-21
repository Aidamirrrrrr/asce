import { Bot, GrammyError } from "grammy";

import type { Project } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { createProjectBot } from "./create-project-bot";
import { markProjectError } from "./project-runtime-status";
import { withDecryptedBotToken } from "./project-token";

const POLLING_START_DELAY_MS = 350;
const POLLING_CONFLICT_RETRIES = 5;

type PollingEntry = {
  bot: Bot;
  botToken: string;
  flowJson: string;
  started: boolean;
};

const registry = new Map<string, PollingEntry>();
const startingProjects = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPollingConflict(error: unknown): boolean {
  return error instanceof GrammyError && error.error_code === 409;
}

export async function clearTelegramWebhook(token: string): Promise<void> {
  const bot = new Bot(token);
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
  } catch {
    // Webhook may not be set.
  }
}

export function getActivePollingProjectIds(): ReadonlySet<string> {
  return new Set(registry.keys());
}

export function isPollingBotRunning(
  project: Pick<Project, "id" | "botToken" | "flowJson">,
): boolean {
  const entry = registry.get(project.id);
  if (!entry?.started) {
    return false;
  }
  return entry.botToken === project.botToken && entry.flowJson === (project.flowJson ?? "");
}

export async function haltPollingBot(projectId: string): Promise<void> {
  const entry = registry.get(projectId);
  if (!entry) {
    return;
  }

  try {
    await entry.bot.stop();
  } catch (error) {
    console.warn(`[bot:${projectId}] stop polling:`, error);
  } finally {
    registry.delete(projectId);
  }

  await sleep(POLLING_START_DELAY_MS);
}

async function startPollingLoop(project: Project, bot: Bot, botToken: string): Promise<void> {
  for (let attempt = 0; attempt < POLLING_CONFLICT_RETRIES; attempt += 1) {
    try {
      await bot.start();
      const entry = registry.get(project.id);
      if (entry) {
        entry.started = true;
      }
      return;
    } catch (error) {
      registry.delete(project.id);

      if (isPollingConflict(error) && attempt < POLLING_CONFLICT_RETRIES - 1) {
        console.warn(
          `[bot:${project.id}] polling 409, retry ${attempt + 1}/${POLLING_CONFLICT_RETRIES}`,
        );
        await clearTelegramWebhook(botToken);
        await sleep(800 * (attempt + 1));
        registry.set(project.id, {
          bot,
          botToken,
          flowJson: project.flowJson ?? "",
          started: false,
        });
        continue;
      }

      if (isPollingConflict(error)) {
        await markProjectError(
          project.id,
          "Конфликт polling: другой процесс держит getUpdates. Остановите старые dev-серверы и нажмите «Запустить» снова.",
        );
        return;
      }

      const message = error instanceof Error ? error.message : "Ошибка polling";
      await markProjectError(project.id, message);
      return;
    }
  }
}

export async function runPollingBot(project: Project): Promise<void> {
  const runtimeProject = withDecryptedBotToken(project);
  if (!runtimeProject.botToken) {
    throw new Error("Токен бота не задан");
  }

  const botToken = runtimeProject.botToken;

  if (startingProjects.has(project.id)) {
    return;
  }

  startingProjects.add(project.id);
  try {
    if (isPollingBotRunning(project)) {
      return;
    }

    await haltPollingBot(project.id);
    await clearTelegramWebhook(botToken);

    const bot = createProjectBot(runtimeProject);

    bot.catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[bot:${project.id}]`, message);
      void markProjectError(project.id, message);
    });

    registry.set(project.id, {
      bot,
      botToken,
      flowJson: project.flowJson ?? "",
      started: false,
    });

    void startPollingLoop(project, bot, botToken);

    await db.project.update({
      where: { id: project.id },
      data: {
        lastError: null,
        runtimeStatus: "running",
      },
    });
  } finally {
    startingProjects.delete(project.id);
  }
}

export function pollingBotNeedsRestart(
  project: Pick<Project, "id" | "botToken" | "flowJson">,
): boolean {
  if (isPollingBotRunning(project)) {
    return false;
  }

  const entry = registry.get(project.id);
  if (!entry) {
    return true;
  }

  return entry.botToken !== project.botToken || entry.flowJson !== (project.flowJson ?? "");
}
