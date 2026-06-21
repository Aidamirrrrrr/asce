import { db } from "@/lib/db";

/**
 * Владелец проекта (платформенный userId) по projectId, с кешем в памяти.
 * Используется в рантайме бота, чтобы списывать ИИ-расход узла ai_reply на
 * владельца. Владелец проекта не меняется → process-local кеш безопасен
 * (архитектура single-process).
 */
const ownerCache = new Map<string, string>();

export async function getProjectOwnerId(projectId: string): Promise<string | null> {
  const cached = ownerCache.get(projectId);
  if (cached) {
    return cached;
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) {
    return null;
  }

  ownerCache.set(projectId, project.userId);
  return project.userId;
}
