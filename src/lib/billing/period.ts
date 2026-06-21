/** Ключ биллингового периода вида "2026-06" (календарный месяц, UTC). */
export function currentPeriodKey(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Конец текущего месяца + 1 месяц — дата следующего списания подписки (UTC). */
export function nextPeriodEnd(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
    ),
  );
}
