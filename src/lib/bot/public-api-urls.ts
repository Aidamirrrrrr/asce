import { buildWebhookUrl, getAppUrl } from "@/lib/bot/config";

export type ProjectPublicUrls = {
  appBaseUrl: string;
  telegramWebhookUrl: string | null;
  ticketVerifyBaseUrl: string;
  yookassaWebhookUrl: string;
};

export function tryGetAppBaseUrl(): string | null {
  try {
    return getAppUrl();
  } catch {
    return null;
  }
}

export function buildProjectPublicUrls(
  projectId: string,
  options?: { appBaseUrl?: string; webhookSecret?: string | null },
): ProjectPublicUrls {
  const appBaseUrl = (options?.appBaseUrl ?? tryGetAppBaseUrl() ?? "").replace(/\/$/, "");

  return {
    appBaseUrl,
    telegramWebhookUrl:
      appBaseUrl && options?.webhookSecret
        ? buildWebhookUrl(projectId, options.webhookSecret)
        : null,
    ticketVerifyBaseUrl: appBaseUrl ? `${appBaseUrl}/api/projects/${projectId}/tickets/verify` : "",
    yookassaWebhookUrl: appBaseUrl
      ? `${appBaseUrl}/api/payments/yookassa/webhook/${projectId}`
      : "",
  };
}

/** Рекомендуемые значения секретов для проекта (если известен APP_URL на сервере). */
export function getProjectSecretSuggestions(
  projectId: string,
  options?: { webhookSecret?: string | null },
): Record<string, string> {
  const urls = buildProjectPublicUrls(projectId, options);
  if (!urls.appBaseUrl) {
    return {};
  }

  return {
    APP_BASE_URL: urls.appBaseUrl,
    VERIFY_BASE_URL: urls.ticketVerifyBaseUrl,
  };
}

export const TICKET_VERIFY_LINK_TEMPLATE = "{{secret.VERIFY_BASE_URL}}/{{var.order_id}}";

export const YOOKASSA_WEBHOOK_SETUP_HINT =
  "HTTP-уведомления ЮKassa (ЛК → Интеграция → HTTP-уведомления): укажите URL webhook этого приложения";
