/** Отдельный процесс `pnpm dev:worker` — единственный, кто держит long polling. */
export function isBotWorkerProcess(): boolean {
  return process.env.BOT_WORKER_PROCESS === "1";
}

/**
 * В dev polling не запускаем внутри Next.js (HMR и рестарты дают 409).
 * Явно: BOT_POLLING_DELEGATED=0 — старое поведение; =1 — только воркер.
 */
export function isPollingDelegatedToWorker(): boolean {
  if (process.env.BOT_POLLING_DELEGATED === "1") {
    return true;
  }
  if (process.env.BOT_POLLING_DELEGATED === "0") {
    return false;
  }
  return process.env.NODE_ENV === "development";
}

export function shouldRunPollingInThisProcess(): boolean {
  if (isBotWorkerProcess()) {
    return true;
  }
  return !isPollingDelegatedToWorker();
}
