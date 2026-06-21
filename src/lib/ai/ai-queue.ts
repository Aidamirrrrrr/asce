/**
 * Глобальная очередь ИИ-запросов (process-local семафор). Ограничивает число
 * ОДНОВРЕМЕННЫХ обращений к модели, чтобы на бете не перегружать общий эндпоинт.
 * Один слот удерживается на всю операцию (генерацию/ответ), а не на каждый
 * tool-step — поэтому пользователь встаёт в очередь один раз.
 *
 * Архитектура single-process (см. memory) гарантирует единый счётчик на инстанс.
 */
export type QueueHooks = {
  /** Вызывается, если слот занят и запрос встал в очередь (position — сколько впереди). */
  onQueued?: (position: number) => void;
  /** Вызывается, когда слот получен и обработка начинается. */
  onStart?: () => void;
};

function getMaxConcurrency(): number {
  const raw = Number(process.env.AI_MAX_CONCURRENCY ?? "24");
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 24;
}

let active = 0;
const waiters: Array<() => void> = [];

function acquire(hooks?: QueueHooks): Promise<void> {
  if (active < getMaxConcurrency()) {
    active += 1;
    return Promise.resolve();
  }

  hooks?.onQueued?.(waiters.length + 1);
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) {
    next();
  }
}

export async function runQueued<T>(fn: () => Promise<T>, hooks?: QueueHooks): Promise<T> {
  await acquire(hooks);
  hooks?.onStart?.();
  try {
    return await fn();
  } finally {
    release();
  }
}

export function getQueueState(): { active: number; waiting: number; max: number } {
  return { active, waiting: waiters.length, max: getMaxConcurrency() };
}

/** Сброс внутреннего состояния — только для тестов (изоляция между кейсами). */
export function __resetQueueForTests(): void {
  active = 0;
  waiters.length = 0;
}
