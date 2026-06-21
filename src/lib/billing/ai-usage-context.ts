import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Контекст атрибуции ИИ-расхода. Устанавливается на границе запроса (API-роут
 * или обработчик сообщения бота), где известен владелец (userId). Клиент
 * Клиент ИИ читает его и списывает токены на нужного пользователя — без
 * протягивания userId через всю цепочку агента/генератора.
 */
export type AiUsageContext = {
  userId: string;
  kind: string;
};

const storage = new AsyncLocalStorage<AiUsageContext>();

export function runWithAiUsage<T>(context: AiUsageContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getAiUsageContext(): AiUsageContext | undefined {
  return storage.getStore();
}
