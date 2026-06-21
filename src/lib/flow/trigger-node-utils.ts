import type { TriggerNodeData } from "@/lib/flow/flow-schema";

export const MAX_INACTIVITY_HOURS = 168;
export const MIN_INACTIVITY_HOURS = 1;
export const DEFAULT_INACTIVITY_HOURS = 24;

export function normalizeInactivityHours(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INACTIVITY_HOURS;
  }

  return Math.min(MAX_INACTIVITY_HOURS, Math.max(MIN_INACTIVITY_HOURS, Math.round(parsed)));
}

export function normalizeTriggerNodeData(data: Partial<TriggerNodeData>): TriggerNodeData {
  const triggerType =
    data.triggerType === "any_message" ||
    data.triggerType === "inactivity" ||
    data.triggerType === "payment_succeeded" ||
    data.triggerType === "command"
      ? data.triggerType
      : "command";

  return {
    label: (typeof data.label === "string" ? data.label.trim() : "") || "Триггер",
    command: (typeof data.command === "string" ? data.command.trim() : "") || "/start",
    triggerType,
    ...(triggerType === "inactivity"
      ? { inactivityHours: normalizeInactivityHours(data.inactivityHours) }
      : {}),
  };
}

export function formatInactivityTriggerPreview(data: TriggerNodeData): string {
  if (data.triggerType === "any_message") {
    return "Любое сообщение";
  }

  if (data.triggerType === "inactivity") {
    const hours = normalizeInactivityHours(data.inactivityHours);
    return `Бездействие ${hours} ч`;
  }

  if (data.triggerType === "payment_succeeded") {
    return "Оплата подтверждена";
  }

  return data.command?.trim() || "/start";
}
