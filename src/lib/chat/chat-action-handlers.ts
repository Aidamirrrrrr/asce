import { db } from "@/lib/db";
import { normalizeCollectionName } from "@/lib/flow/save-record-node-utils";
import type { ChatPendingAction } from "@/lib/projects";

function periodStart(days?: number): Date | null {
  if (days == null || !Number.isFinite(days) || days <= 0) {
    return null;
  }
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function deleteProjectRecords(
  projectId: string,
  params: { days?: number; collection?: string },
): Promise<number> {
  const since = periodStart(params.days);
  const result = await db.projectRecord.deleteMany({
    where: {
      projectId,
      ...(params.collection ? { collection: normalizeCollectionName(params.collection) } : {}),
      ...(since ? { createdAt: { lt: since } } : {}),
    },
  });
  return result.count;
}

/** Выполнить отложенное действие после подтверждения в action-карточке. */
export async function executeChatPendingAction(
  projectId: string,
  action: ChatPendingAction,
): Promise<{ message: string }> {
  switch (action.type) {
    case "delete_records": {
      const deleted = await deleteProjectRecords(projectId, action.params);
      return {
        message:
          deleted > 0
            ? `Готово: удалено ${deleted} ${deleted === 1 ? "запись" : deleted < 5 ? "записи" : "записей"}.`
            : "Подходящих записей для удаления не найдено.",
      };
    }
    default:
      throw new Error(`Неизвестное действие: ${String((action as { type: string }).type)}`);
  }
}
