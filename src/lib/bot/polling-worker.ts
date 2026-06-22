import type { Project } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { createDefaultFlow } from "@/lib/flow/default-flow";
import { loadFlowDocument } from "@/lib/flow/load-flow-document";

import { RuntimeRecoveryScheduler } from "./error-recovery";
import { collectRequiredSecretKeys, flowHasTrigger } from "./flow-executor";
import {
  getActivePollingProjectIds,
  haltPollingBot,
  isPollingBotRunning,
  pollingBotNeedsRestart,
  runPollingBot,
} from "./polling-runtime";
import { findMissingRequiredSecrets } from "./project-secrets";
import { processDueJobs } from "./scheduled-jobs";
import { isTransientRuntimeError } from "./telegram-api-errors";

const SYNC_INTERVAL_MS = 2_000;
const JOB_PROCESS_INTERVAL_MS = 7_000;
const RECOVERY_INTERVAL_MS = 60_000;
const STARTUP_POLLING_RETRY_MS = 3_000;
const STARTUP_POLLING_RETRY_WINDOW_MS = 90_000;

let syncInFlight: Promise<void> | null = null;
const recoveryScheduler = new RuntimeRecoveryScheduler();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadPollingCandidates(): Promise<Project[]> {
  return db.project.findMany({
    where: {
      runtimeStatus: "running",
      deliveryMode: "polling",
      botToken: { not: null },
    },
  });
}

async function canStartProject(project: Project): Promise<boolean> {
  const flow = loadFlowDocument(project.flowJson, createDefaultFlow());
  if (!flowHasTrigger(flow)) {
    return false;
  }

  const requiredKeys = collectRequiredSecretKeys(flow);
  const missing = await findMissingRequiredSecrets(project.id, requiredKeys);
  return missing.length === 0;
}

async function syncPollingBotsInner(): Promise<void> {
  const candidates = await loadPollingCandidates();
  const targetIds = new Set(candidates.map((project) => project.id));
  const activeIds = getActivePollingProjectIds();

  for (const projectId of activeIds) {
    if (!targetIds.has(projectId)) {
      await haltPollingBot(projectId);
    }
  }

  for (const project of candidates) {
    if (!(await canStartProject(project))) {
      continue;
    }

    if (!pollingBotNeedsRestart(project)) {
      continue;
    }

    try {
      const started = await runPollingBot(project);
      if (started) {
        console.log(`[worker] polling started: ${project.id} (${project.name})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка запуска polling";
      console.error(`[worker] ${project.id}:`, message);
    }
  }
}

function syncPollingBots(): Promise<void> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = syncPollingBotsInner().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

async function restorePollingBotsOnStartup(): Promise<void> {
  const deadline = Date.now() + STARTUP_POLLING_RETRY_WINDOW_MS;

  while (Date.now() < deadline) {
    await syncPollingBots();

    const candidates = await loadPollingCandidates();
    const pending: Project[] = [];
    for (const project of candidates) {
      if (!(await canStartProject(project))) {
        continue;
      }
      if (!isPollingBotRunning(project)) {
        pending.push(project);
      }
    }

    if (pending.length === 0) {
      return;
    }

    console.log(
      `[worker] startup: ${pending.length} polling bot(s) not running yet, retry in ${STARTUP_POLLING_RETRY_MS}ms`,
    );
    await sleep(STARTUP_POLLING_RETRY_MS);
  }

  console.warn("[worker] startup: some polling bots may still be waiting for Redis lock");
}

/**
 * Авто-восстановление polling-ботов, застрявших в runtimeStatus="error".
 * Ретраим ТОЛЬКО транзиентные сбои (сеть/таймаут/5xx) и с экспоненциальным
 * backoff, чтобы не зациклиться. Перманентные (битый токен 401/404) не трогаем —
 * их чинит только пользователь, заменив токен.
 */
async function recoverErroredPollingBots(): Promise<void> {
  const errored = await db.project.findMany({
    where: { runtimeStatus: "error", deliveryMode: "polling", botToken: { not: null } },
  });
  const erroredIds = new Set(errored.map((project) => project.id));

  // Боты, которые больше не в ошибке, — успешно ожили: сбрасываем их счётчик.
  for (const trackedId of recoveryScheduler.trackedIds()) {
    if (!erroredIds.has(trackedId)) {
      recoveryScheduler.recordSuccess(trackedId);
    }
  }

  const now = Date.now();
  for (const project of errored) {
    if (!isTransientRuntimeError(project.lastError)) {
      continue; // перманентная ошибка — ждём вмешательства пользователя
    }
    if (!recoveryScheduler.shouldAttempt(project.id, now)) {
      continue; // ещё рано (backoff) или исчерпан лимит попыток
    }

    recoveryScheduler.recordAttempt(project.id, now);
    await db.project.update({
      where: { id: project.id },
      data: { runtimeStatus: "running", lastError: null },
    });
    console.log(`[worker] recovery: retrying ${project.id} (${project.name})`);
  }

  // Дать sync-циклу шанс поднять только что сброшенных в running ботов.
  await syncPollingBots();
}

export function runBotPollingWorker(): void {
  console.log("[worker] bot polling worker started");

  void restorePollingBotsOnStartup();

  setInterval(() => {
    void syncPollingBots().catch((error) => {
      console.error("[worker] sync polling:", error);
    });
  }, SYNC_INTERVAL_MS);

  setInterval(() => {
    void processDueJobs().catch((error) => {
      console.error("[worker] process jobs:", error);
    });
  }, JOB_PROCESS_INTERVAL_MS);

  setInterval(() => {
    void recoverErroredPollingBots().catch((error) => {
      console.error("[worker] recovery:", error);
    });
  }, RECOVERY_INTERVAL_MS);
}
