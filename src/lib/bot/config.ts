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

/** В development — polling (без публичного APP_URL); в production — webhook. */
export function getDefaultDeliveryMode(): DeliveryMode {
  return process.env.NODE_ENV === "development" ? "polling" : "webhook";
}
