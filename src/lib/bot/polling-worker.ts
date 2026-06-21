import type { Project } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { createDefaultFlow } from "@/lib/flow/default-flow";
import { loadFlowDocument } from "@/lib/flow/load-flow-document";

import { collectRequiredSecretKeys, flowHasTrigger } from "./flow-executor";
import {
  getActivePollingProjectIds,
  haltPollingBot,
  pollingBotNeedsRestart,
  runPollingBot,
} from "./polling-runtime";
import { findMissingRequiredSecrets } from "./project-secrets";
import { processDueJobs } from "./scheduled-jobs";

const SYNC_INTERVAL_MS = 2_000;
const JOB_PROCESS_INTERVAL_MS = 7_000;

let syncInFlight: Promise<void> | null = null;

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

export function runBotPollingWorker(): void {
  console.log("[worker] bot polling worker started");

  void syncPollingBots();

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
}
