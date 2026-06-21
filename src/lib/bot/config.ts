export type DeliveryMode = "webhook" | "polling";

export function getAppUrl(): string {
  const url = process.env.APP_URL?.trim();
  if (!url) {
    throw new Error("APP_URL не задан");
  }

  return url.replace(/\/$/, "");
}

export function buildWebhookUrl(projectId: string, webhookSecret: string): string {
  const secret = encodeURIComponent(webhookSecret);
  return `${getAppUrl()}/api/telegram/webhook/${projectId}?secret=${secret}`;
}

export function isDeliveryMode(value: string): value is DeliveryMode {
  return value === "webhook" || value === "polling";
}

/**
 * Режим доставки апдейтов Telegram.
 * BOT_DELIVERY_MODE переопределяет всё (в т.ч. production).
 * Иначе: dev → polling, prod → webhook (или polling из БД проекта).
 */
export function resolveDeliveryMode(projectDeliveryMode?: DeliveryMode): DeliveryMode {
  const forced = process.env.BOT_DELIVERY_MODE?.trim();
  if (forced && isDeliveryMode(forced)) {
    return forced;
  }

  if (process.env.NODE_ENV === "development") {
    return "polling";
  }

  return projectDeliveryMode === "polling" ? "polling" : "webhook";
}

/** Режим для новых проектов. */
export function getDefaultDeliveryMode(): DeliveryMode {
  return resolveDeliveryMode();
}
