import { db } from "@/lib/db";

/**
 * Каталог безопасных функций-агрегатов аналитики бота.
 *
 * Каждая функция ЖЁСТКО ограничена одним projectId (multi-tenant изоляция) и
 * возвращает только агрегированные числа/списки — никакого сырого SQL и никакого
 * доступа к данным других проектов. Это фундамент для Q&A-агента: модель может
 * вызывать только эти функции через function-calling.
 */

function periodStart(days?: number | null): Date | null {
  if (days == null || !Number.isFinite(days) || days <= 0) {
    return null;
  }
  const now = Date.now();
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(limit), max);
}

export async function countUsers(projectId: string): Promise<{ total: number; blocked: number }> {
  const [total, blocked] = await Promise.all([
    db.botUser.count({ where: { projectId } }),
    db.botUser.count({ where: { projectId, blocked: true } }),
  ]);
  return { total, blocked };
}

export async function activeUsers(
  projectId: string,
  days = 7,
): Promise<{ days: number; count: number }> {
  const since = periodStart(days);
  const count = await db.botUser.count({
    where: {
      projectId,
      ...(since ? { lastSeenAt: { gte: since } } : {}),
    },
  });
  return { days, count };
}

export async function newUsers(
  projectId: string,
  days = 7,
): Promise<{ days: number; count: number }> {
  const since = periodStart(days);
  const count = await db.botUser.count({
    where: {
      projectId,
      ...(since ? { firstSeenAt: { gte: since } } : {}),
    },
  });
  return { days, count };
}

export async function messagesCount(
  projectId: string,
  options: { direction?: "in" | "out" | "all"; days?: number } = {},
): Promise<{ direction: string; days: number | null; count: number }> {
  const direction = options.direction ?? "all";
  const since = periodStart(options.days);
  const typeFilter =
    direction === "in"
      ? { type: "message_in" }
      : direction === "out"
        ? { type: "message_out" }
        : { type: { in: ["message_in", "message_out"] } };

  const count = await db.botEvent.count({
    where: {
      projectId,
      ...typeFilter,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  });
  return { direction, days: options.days ?? null, count };
}

export async function eventsByType(
  projectId: string,
  days?: number,
): Promise<{ days: number | null; items: { type: string; count: number }[] }> {
  const since = periodStart(days);
  const grouped = await db.botEvent.groupBy({
    by: ["type"],
    where: {
      projectId,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _count: { _all: true },
  });
  const items = grouped
    .map((row) => ({ type: row.type, count: row._count._all }))
    .sort((a, b) => b.count - a.count);
  return { days: days ?? null, items };
}

export async function topCommands(
  projectId: string,
  options: { days?: number; limit?: number } = {},
): Promise<{ days: number | null; items: { command: string; count: number }[] }> {
  const since = periodStart(options.days);
  const limit = clampLimit(options.limit, 10, 50);
  const grouped = await db.botEvent.groupBy({
    by: ["meta"],
    where: {
      projectId,
      type: "command",
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const row of grouped) {
    let command = "(unknown)";
    if (row.meta) {
      try {
        const parsed = JSON.parse(row.meta) as { command?: unknown };
        if (typeof parsed.command === "string" && parsed.command) {
          command = parsed.command;
        }
      } catch {
        // игнорируем нечитаемый meta
      }
    }
    counts.set(command, (counts.get(command) ?? 0) + row._count._all);
  }

  const items = [...counts.entries()]
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return { days: options.days ?? null, items };
}

export async function funnelByNode(
  projectId: string,
  options: { days?: number; limit?: number } = {},
): Promise<{ days: number | null; items: { nodeId: string; count: number }[] }> {
  const since = periodStart(options.days);
  const limit = clampLimit(options.limit, 20, 100);
  const grouped = await db.botEvent.groupBy({
    by: ["nodeId"],
    where: {
      projectId,
      type: "node_executed",
      nodeId: { not: null },
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _count: { _all: true },
  });
  const items = grouped
    .map((row) => ({ nodeId: row.nodeId ?? "(unknown)", count: row._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  return { days: options.days ?? null, items };
}

export async function errorsStats(
  projectId: string,
  options: { days?: number; limit?: number } = {},
): Promise<{
  days: number | null;
  count: number;
  recent: { message: string; createdAt: string }[];
}> {
  const since = periodStart(options.days);
  const limit = clampLimit(options.limit, 5, 20);
  const where = {
    projectId,
    type: "error",
    ...(since ? { createdAt: { gte: since } } : {}),
  };
  const [count, recent] = await Promise.all([
    db.botEvent.count({ where }),
    db.botEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { meta: true, createdAt: true },
    }),
  ]);

  return {
    days: options.days ?? null,
    count,
    recent: recent.map((row) => {
      let message = "Ошибка";
      if (row.meta) {
        try {
          const parsed = JSON.parse(row.meta) as { message?: unknown };
          if (typeof parsed.message === "string" && parsed.message) {
            message = parsed.message;
          }
        } catch {
          // игнорируем
        }
      }
      return { message, createdAt: row.createdAt.toISOString() };
    }),
  };
}
