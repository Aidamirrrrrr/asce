import type { Update } from "grammy/types";

type UpdateQueueGlobal = typeof globalThis & {
  __botUpdateQueues?: Map<string, Promise<unknown>>;
};

function getQueues(): Map<string, Promise<unknown>> {
  const store = globalThis as UpdateQueueGlobal;
  if (!store.__botUpdateQueues) {
    store.__botUpdateQueues = new Map();
  }
  return store.__botUpdateQueues;
}

/** Chat id targeted by an update, used to serialize processing per conversation. */
export function getUpdateChatId(update: Update): number | undefined {
  return (
    update.message?.chat.id ??
    update.edited_message?.chat.id ??
    update.callback_query?.message?.chat.id ??
    update.my_chat_member?.chat.id ??
    update.chat_member?.chat.id ??
    update.channel_post?.chat.id ??
    update.edited_channel_post?.chat.id
  );
}

/** Default cap on a single update's processing so one stuck update can't block a chat's queue. */
const DEFAULT_UPDATE_TIMEOUT_MS = 60_000;

class UpdateTimeoutError extends Error {
  constructor(ms: number) {
    super(`Update processing exceeded ${ms}ms`);
    this.name = "UpdateTimeoutError";
  }
}

function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new UpdateTimeoutError(ms)), ms);
    fn().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Runs `fn` sequentially per key so updates from the same chat never overlap.
 * Without this, concurrent webhook updates race on the shared session store
 * (e.g. input-wait state), making the bot answer with the wrong message.
 *
 * Each run is capped by a timeout so a single hung update (e.g. a stalled AI
 * call or Telegram API request) advances the queue instead of blocking every
 * later message from that chat. Safe because the app runs as a single
 * long-lived process.
 */
export async function runSerializedByKey<T>(
  key: string,
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_UPDATE_TIMEOUT_MS,
): Promise<T> {
  const queues = getQueues();
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => withTimeout(fn, timeoutMs));

  // Store the same promise we compare against on cleanup, so the entry is
  // actually removed once this is the tail of the chain (no map leak).
  const tracked = run.catch(() => undefined);
  queues.set(key, tracked);
  void tracked.finally(() => {
    if (queues.get(key) === tracked) {
      queues.delete(key);
    }
  });

  return run;
}
