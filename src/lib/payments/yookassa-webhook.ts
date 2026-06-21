import { verifyHmacSha256Hex } from "@/lib/crypto/secrets-crypto";

export type YooKassaNotification = {
  type: string;
  event: string;
  object: {
    id: string;
    status?: string;
    amount?: { value?: string; currency?: string };
    metadata?: Record<string, string>;
  };
};

export function parseYooKassaNotification(rawBody: string): YooKassaNotification | null {
  try {
    const parsed = JSON.parse(rawBody) as Partial<YooKassaNotification>;
    if (
      parsed.type !== "notification" ||
      typeof parsed.event !== "string" ||
      !parsed.object ||
      typeof parsed.object.id !== "string"
    ) {
      return null;
    }

    return parsed as YooKassaNotification;
  } catch {
    return null;
  }
}

export function verifyYooKassaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretKey: string,
): boolean {
  if (!signatureHeader?.trim()) {
    return false;
  }

  return verifyHmacSha256Hex(rawBody, secretKey, signatureHeader);
}

export function extractChatAndUserFromMetadata(
  metadata: Record<string, string> | undefined,
): { chatId: number; userId: number } | null {
  if (!metadata) {
    return null;
  }

  const chatId = Number(metadata.chat_id ?? metadata.chatId);
  const userId = Number(metadata.user_id ?? metadata.userId);
  if (!(Number.isFinite(chatId) && Number.isFinite(userId))) {
    return null;
  }

  return { chatId, userId };
}
