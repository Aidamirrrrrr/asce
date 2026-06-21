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

/**
 * Runs `fn` sequentially per key so updates from the same chat never overlap.
 * Without this, concurrent webhook updates race on the shared session store
 * (e.g. input-wait state), making the bot answer with the wrong message.
 * Safe because the app runs as a single long-lived process.
 */
export async function runSerializedByKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const queues = getQueues();
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);

  queues.set(
    key,
    run.finally(() => {
      if (queues.get(key) === run) {
        queues.delete(key);
      }
    }),
  );

  return run;
}
