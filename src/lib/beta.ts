/**
 * Лимит набора пользователей на бету. Защита от перегрузки общего ИИ-эндпоинта:
 * вместе с очередью (src/lib/ai/ai-queue.ts) держит нагрузку предсказуемой.
 */
export function getMaxBetaUsers(): number {
  const raw = Number(process.env.MAX_BETA_USERS ?? "100");
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 100;
}
