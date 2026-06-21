import { db } from "@/lib/db";
import { normalizeCollectionName } from "@/lib/flow/save-record-node-utils";

/** Сохранить запись (заявку/лид), собранную узлом save_record. */
export async function saveProjectRecord(input: {
  projectId: string;
  collection: string;
  data: Record<string, string>;
  userId?: string | number | null;
  chatId?: string | number | null;
}): Promise<void> {
  await db.projectRecord.create({
    data: {
      projectId: input.projectId,
      collection: normalizeCollectionName(input.collection),
      dataJson: JSON.stringify(input.data ?? {}),
      userId: input.userId != null ? String(input.userId) : null,
      chatId: input.chatId != null ? String(input.chatId) : null,
    },
  });
}

export type ProjectRecordRow = {
  id: string;
  collection: string;
  data: Record<string, unknown>;
  userId: string | null;
  chatId: string | null;
  createdAt: string;
};

/** Прочитать последние записи проекта (для вкладки «Заявки»). */
export async function listProjectRecords(input: {
  projectId: string;
  collection?: string;
  limit?: number;
  days?: number | null;
}): Promise<ProjectRecordRow[]> {
  const since =
    input.days != null && Number.isFinite(input.days) && input.days > 0
      ? new Date(Date.now() - input.days * 24 * 60 * 60 * 1000)
      : null;

  const rows = await db.projectRecord.findMany({
    where: {
      projectId: input.projectId,
      ...(input.collection ? { collection: normalizeCollectionName(input.collection) } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 100, 1), 500),
  });

  return rows.map((row) => ({
    id: row.id,
    collection: row.collection,
    data: parseDataJson(row.dataJson),
    userId: row.userId,
    chatId: row.chatId,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Список коллекций проекта с количеством записей. */
export async function listProjectCollections(
  projectId: string,
): Promise<Array<{ collection: string; count: number }>> {
  const grouped = await db.projectRecord.groupBy({
    by: ["collection"],
    where: { projectId },
    _count: { _all: true },
    orderBy: { collection: "asc" },
  });

  return grouped.map((entry) => ({ collection: entry.collection, count: entry._count._all }));
}

/** Число записей (заявок) в проекте или коллекции. */
export async function countProjectRecords(
  projectId: string,
  collection?: string,
  days?: number | null,
): Promise<{ total: number; collection: string | null; days: number | null }> {
  const since =
    days != null && Number.isFinite(days) && days > 0
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : null;

  const total = await db.projectRecord.count({
    where: {
      projectId,
      ...(collection ? { collection: normalizeCollectionName(collection) } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  });

  return {
    total,
    collection: collection ? normalizeCollectionName(collection) : null,
    days: since ? (days ?? null) : null,
  };
}

function parseDataJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
