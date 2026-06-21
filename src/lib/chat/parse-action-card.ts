import type { ChatActionCard, ChatActionOption, ChatPendingAction } from "@/lib/projects";

function parseActions(raw: unknown): ChatActionOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const actions: ChatActionOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!(id && label)) {
      continue;
    }
    const variant =
      record.variant === "destructive" ||
      record.variant === "outline" ||
      record.variant === "default"
        ? record.variant
        : undefined;
    actions.push({ id, label, ...(variant ? { variant } : {}) });
  }
  return actions;
}

function parsePendingAction(raw: unknown): ChatPendingAction | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  if (record.type !== "delete_records") {
    return undefined;
  }

  const params =
    record.params && typeof record.params === "object"
      ? (record.params as Record<string, unknown>)
      : {};

  return {
    type: "delete_records",
    params: {
      ...(typeof params.days === "number" && Number.isFinite(params.days)
        ? { days: params.days }
        : {}),
      ...(typeof params.collection === "string" && params.collection.trim()
        ? { collection: params.collection.trim() }
        : {}),
    },
  };
}

export function parsePresentActionCardArgs(
  raw: Record<string, unknown>,
): ChatActionCard | { error: string } {
  const actions = parseActions(raw.actions);
  if (actions.length === 0) {
    return { error: "Укажите хотя бы одну кнопку в actions" };
  }

  const pendingAction = parsePendingAction(raw.pendingAction);
  if (!pendingAction) {
    return { error: "Укажите pendingAction с поддерживаемым type (delete_records)" };
  }

  return {
    title: typeof raw.title === "string" ? raw.title.trim() : undefined,
    description: typeof raw.description === "string" ? raw.description.trim() : undefined,
    body: typeof raw.body === "string" ? raw.body.trim() : undefined,
    actions,
    pendingAction,
    status: "pending",
  };
}
