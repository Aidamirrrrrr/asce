import { db } from "@/lib/db";
import { normalizeCollectionName } from "@/lib/flow/save-record-node-utils";

export const PROJECT_DATA_ENTITIES = [
  "bot_users",
  "bot_events",
  "records",
  "user_variables",
] as const;

export type ProjectDataEntity = (typeof PROJECT_DATA_ENTITIES)[number];

export type ProjectDataOperation = "count" | "list" | "group_by";

export type ProjectDataFilterOp = "eq" | "ne" | "contains" | "gt" | "gte" | "lt" | "lte" | "in";

export type ProjectDataFilter = {
  field: string;
  op: ProjectDataFilterOp;
  value?: string | number | boolean | string[];
};

export type ProjectDataQuery = {
  entity: ProjectDataEntity;
  operation: ProjectDataOperation;
  /** Период в днях для полей даты (createdAt, firstSeenAt, lastSeenAt). */
  days?: number;
  filters?: ProjectDataFilter[];
  /** Для group_by — поле группировки. */
  groupBy?: string;
  /** Для list — сортировка. */
  sort?: { field: string; direction?: "asc" | "desc" };
  limit?: number;
};

const MAX_LIST_LIMIT = 100;
const MAX_GROUP_LIMIT = 50;

const ENTITY_DATE_FIELD: Record<ProjectDataEntity, string> = {
  bot_users: "lastSeenAt",
  bot_events: "createdAt",
  records: "createdAt",
  user_variables: "updatedAt",
};

const ALLOWED_FIELDS: Record<ProjectDataEntity, Set<string>> = {
  bot_users: new Set([
    "userId",
    "chatId",
    "username",
    "firstName",
    "lastName",
    "languageCode",
    "isPremium",
    "isBot",
    "blocked",
    "messageCount",
    "firstSeenAt",
    "lastSeenAt",
  ]),
  bot_events: new Set(["userId", "chatId", "type", "nodeId", "meta", "createdAt"]),
  records: new Set(["collection", "userId", "chatId", "createdAt", "data"]),
  user_variables: new Set(["userId", "key", "value", "updatedAt"]),
};

export function describeProjectDataSchema(): {
  entities: Array<{
    name: ProjectDataEntity;
    description: string;
    fields: string[];
    dateField: string;
    dataFieldPrefix?: string;
  }>;
  operations: ProjectDataOperation[];
  filterOps: ProjectDataFilterOp[];
  notes: string[];
} {
  return {
    entities: [
      {
        name: "bot_users",
        description: "Пользователи бота (Telegram userId, имя, активность).",
        fields: [...ALLOWED_FIELDS.bot_users],
        dateField: "lastSeenAt",
      },
      {
        name: "bot_events",
        description:
          "Журнал событий: message_in, message_out, command, callback, node_executed, error.",
        fields: [...ALLOWED_FIELDS.bot_events],
        dateField: "createdAt",
      },
      {
        name: "records",
        description: "Заявки и лиды из узла save_record.",
        fields: [...ALLOWED_FIELDS.records],
        dateField: "createdAt",
        dataFieldPrefix:
          "data.<ключ> — поля заявки, например data.name, data.phone (фильтр contains/eq).",
      },
      {
        name: "user_variables",
        description: "Переменные пользователей, записанные сценарием.",
        fields: [...ALLOWED_FIELDS.user_variables],
        dateField: "updatedAt",
      },
    ],
    operations: ["count", "list", "group_by"],
    filterOps: ["eq", "ne", "contains", "gt", "gte", "lt", "lte", "in"],
    notes: [
      "Все запросы ограничены текущим проектом.",
      "Для records фильтруйте data.<поле> по значениям в заявке.",
      "group_by поддерживает: type, nodeId, collection, blocked, username, key и др. скалярные поля.",
      "limit list ≤ 100, group_by ≤ 50.",
    ],
  };
}

function clampLimit(limit: number | undefined, max: number, fallback: number): number {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(limit), max);
}

function periodStart(days?: number): Date | null {
  if (days == null || !Number.isFinite(days) || days <= 0) {
    return null;
  }
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function isEntity(value: string): value is ProjectDataEntity {
  return (PROJECT_DATA_ENTITIES as readonly string[]).includes(value);
}

function isOperation(value: string): value is ProjectDataOperation {
  return value === "count" || value === "list" || value === "group_by";
}

function isFilterOp(value: string): value is ProjectDataFilterOp {
  return (
    value === "eq" ||
    value === "ne" ||
    value === "contains" ||
    value === "gt" ||
    value === "gte" ||
    value === "lt" ||
    value === "lte" ||
    value === "in"
  );
}

function normalizeField(entity: ProjectDataEntity, field: string): string {
  const trimmed = field.trim();
  if (entity === "records" && trimmed.startsWith("data.")) {
    return trimmed;
  }
  return trimmed;
}

function isFieldAllowed(entity: ProjectDataEntity, field: string): boolean {
  if (entity === "records" && field.startsWith("data.")) {
    const key = field.slice(5).trim();
    return key.length > 0 && key.length <= 64;
  }
  return ALLOWED_FIELDS[entity].has(field);
}

function parseFilters(raw: unknown): ProjectDataFilter[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const filters: ProjectDataFilter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const field = typeof record.field === "string" ? record.field.trim() : "";
    const op = typeof record.op === "string" ? record.op : "";
    if (!(field && isFilterOp(op))) {
      continue;
    }
    filters.push({
      field,
      op,
      value: record.value as ProjectDataFilter["value"],
    });
  }
  return filters;
}

export function parseProjectDataQuery(
  raw: Record<string, unknown>,
): ProjectDataQuery | { error: string } {
  const entity = typeof raw.entity === "string" ? raw.entity : "";
  const operation = typeof raw.operation === "string" ? raw.operation : "";

  if (!isEntity(entity)) {
    return { error: `entity должен быть одним из: ${PROJECT_DATA_ENTITIES.join(", ")}` };
  }
  if (!isOperation(operation)) {
    return { error: "operation должен быть count, list или group_by" };
  }

  const days = typeof raw.days === "number" && Number.isFinite(raw.days) ? raw.days : undefined;
  const filters = parseFilters(raw.filters);
  const groupBy = typeof raw.groupBy === "string" ? raw.groupBy.trim() : undefined;

  let sort: ProjectDataQuery["sort"];
  if (raw.sort && typeof raw.sort === "object") {
    const sortRecord = raw.sort as Record<string, unknown>;
    const field = typeof sortRecord.field === "string" ? sortRecord.field.trim() : "";
    const direction = sortRecord.direction === "desc" ? "desc" : "asc";
    if (field) {
      sort = { field, direction };
    }
  }

  const limit = typeof raw.limit === "number" && Number.isFinite(raw.limit) ? raw.limit : undefined;

  for (const filter of filters) {
    const normalized = normalizeField(entity, filter.field);
    if (!isFieldAllowed(entity, normalized)) {
      return { error: `Недопустимое поле фильтра: ${filter.field}` };
    }
    filter.field = normalized;
  }

  if (operation === "group_by") {
    if (!groupBy) {
      return { error: "Для group_by укажите groupBy" };
    }
    const normalizedGroup = normalizeField(entity, groupBy);
    if (!isFieldAllowed(entity, normalizedGroup)) {
      return { error: `Недопустимое поле groupBy: ${groupBy}` };
    }
  }

  if (sort) {
    const normalizedSort = normalizeField(entity, sort.field);
    if (!isFieldAllowed(entity, normalizedSort)) {
      return { error: `Недопустимое поле сортировки: ${sort.field}` };
    }
    sort = { ...sort, field: normalizedSort };
  }

  return {
    entity,
    operation,
    days,
    filters,
    ...(groupBy ? { groupBy: normalizeField(entity, groupBy) } : {}),
    ...(sort ? { sort } : {}),
    limit,
  };
}

function matchScalar(
  actual: unknown,
  op: ProjectDataFilterOp,
  expected: ProjectDataFilter["value"],
): boolean {
  if (op === "in") {
    const values = Array.isArray(expected) ? expected.map(String) : [];
    return values.includes(String(actual ?? ""));
  }

  if (op === "contains") {
    return String(actual ?? "")
      .toLowerCase()
      .includes(String(expected ?? "").toLowerCase());
  }

  if (typeof actual === "boolean" || typeof expected === "boolean") {
    const left = Boolean(actual);
    const right = Boolean(expected);
    if (op === "eq") {
      return left === right;
    }
    if (op === "ne") {
      return left !== right;
    }
    return false;
  }

  if (typeof actual === "number" || typeof expected === "number") {
    const left = Number(actual);
    const right = Number(expected);
    if (!(Number.isFinite(left) && Number.isFinite(right))) {
      return false;
    }
    if (op === "eq") {
      return left === right;
    }
    if (op === "ne") {
      return left !== right;
    }
    if (op === "gt") {
      return left > right;
    }
    if (op === "gte") {
      return left >= right;
    }
    if (op === "lt") {
      return left < right;
    }
    if (op === "lte") {
      return left <= right;
    }
    return false;
  }

  const left = String(actual ?? "");
  const right = String(expected ?? "");
  if (op === "eq") {
    return left === right;
  }
  if (op === "ne") {
    return left !== right;
  }
  if (op === "gt") {
    return left > right;
  }
  if (op === "gte") {
    return left >= right;
  }
  if (op === "lt") {
    return left < right;
  }
  if (op === "lte") {
    return left <= right;
  }
  return false;
}

function getRecordFieldValue(row: Record<string, unknown>, field: string): unknown {
  if (field.startsWith("data.")) {
    const key = field.slice(5);
    const data = row.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return (data as Record<string, unknown>)[key];
    }
    return undefined;
  }
  return row[field];
}

function applyMemoryFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: ProjectDataFilter[],
): T[] {
  if (filters.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    filters.every((filter) =>
      matchScalar(getRecordFieldValue(row, filter.field), filter.op, filter.value),
    ),
  );
}

function parseRecordDataJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function serializeBotUser(row: {
  userId: string;
  chatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  isPremium: boolean;
  isBot: boolean;
  blocked: boolean;
  messageCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}): Record<string, unknown> {
  return {
    userId: row.userId,
    chatId: row.chatId,
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    languageCode: row.languageCode,
    isPremium: row.isPremium,
    isBot: row.isBot,
    blocked: row.blocked,
    messageCount: row.messageCount,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

function buildPrismaWhereFromFilters(
  entity: ProjectDataEntity,
  filters: ProjectDataFilter[],
  days?: number,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const dateField = ENTITY_DATE_FIELD[entity];
  const since = periodStart(days);

  if (since) {
    where[dateField] = { gte: since };
  }

  for (const filter of filters) {
    if (filter.field.startsWith("data.")) {
      continue;
    }

    const value = filter.value;
    switch (filter.op) {
      case "eq":
        where[filter.field] = value;
        break;
      case "ne":
        where[filter.field] = { not: value };
        break;
      case "contains":
        where[filter.field] = { contains: String(value ?? "") };
        break;
      case "gt":
        where[filter.field] = { gt: value };
        break;
      case "gte":
        where[filter.field] = { gte: value };
        break;
      case "lt":
        where[filter.field] = { lt: value };
        break;
      case "lte":
        where[filter.field] = { lte: value };
        break;
      case "in":
        where[filter.field] = { in: Array.isArray(value) ? value : [value] };
        break;
      default:
        break;
    }

    if (entity === "records" && filter.field === "collection" && typeof value === "string") {
      where.collection = normalizeCollectionName(value);
    }
  }

  return where;
}

function groupRows(
  rows: Record<string, unknown>[],
  groupBy: string,
  limit: number,
): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = getRecordFieldValue(row, groupBy);
    const key = value == null ? "(пусто)" : String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

async function queryBotUsers(projectId: string, query: ProjectDataQuery): Promise<unknown> {
  const prismaFilters = (query.filters ?? []).filter((filter) => !filter.field.startsWith("data."));
  const memoryFilters = (query.filters ?? []).filter((filter) => filter.field.startsWith("data."));
  const where = {
    projectId,
    ...buildPrismaWhereFromFilters("bot_users", prismaFilters, query.days),
  };

  if (query.operation === "count") {
    if (memoryFilters.length > 0) {
      const rows = await db.botUser.findMany({ where });
      const serialized = rows.map(serializeBotUser);
      return { count: applyMemoryFilters(serialized, memoryFilters).length };
    }
    const count = await db.botUser.count({ where });
    return { count };
  }

  if (query.operation === "group_by" && query.groupBy) {
    const rows = await db.botUser.findMany({ where });
    const serialized = rows.map(serializeBotUser);
    const filtered = applyMemoryFilters(serialized, memoryFilters);
    return {
      groupBy: query.groupBy,
      items: groupRows(filtered, query.groupBy, clampLimit(query.limit, MAX_GROUP_LIMIT, 20)),
    };
  }

  const limit = clampLimit(query.limit, MAX_LIST_LIMIT, 25);
  const orderBy = query.sort
    ? { [query.sort.field]: query.sort.direction ?? "asc" }
    : { lastSeenAt: "desc" as const };

  const rows = await db.botUser.findMany({
    where,
    orderBy,
    take: memoryFilters.length > 0 ? MAX_LIST_LIMIT : limit,
  });
  const serialized = applyMemoryFilters(rows.map(serializeBotUser), memoryFilters).slice(0, limit);
  return { items: serialized, count: serialized.length };
}

async function queryBotEvents(projectId: string, query: ProjectDataQuery): Promise<unknown> {
  const where = {
    projectId,
    ...buildPrismaWhereFromFilters("bot_events", query.filters ?? [], query.days),
  };

  if (query.operation === "count") {
    return { count: await db.botEvent.count({ where }) };
  }

  if (query.operation === "group_by" && query.groupBy) {
    const rows = await db.botEvent.findMany({
      where,
      select: {
        type: true,
        nodeId: true,
        userId: true,
        chatId: true,
        createdAt: true,
        meta: true,
      },
      take: 5000,
    });
    const serialized = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    return {
      groupBy: query.groupBy,
      items: groupRows(serialized, query.groupBy, clampLimit(query.limit, MAX_GROUP_LIMIT, 20)),
    };
  }

  const limit = clampLimit(query.limit, MAX_LIST_LIMIT, 25);
  const orderBy = query.sort
    ? { [query.sort.field]: query.sort.direction ?? "asc" }
    : { createdAt: "desc" as const };

  const rows = await db.botEvent.findMany({
    where,
    orderBy,
    take: limit,
    select: {
      userId: true,
      chatId: true,
      type: true,
      nodeId: true,
      meta: true,
      createdAt: true,
    },
  });

  return {
    items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    count: rows.length,
  };
}

async function queryRecords(projectId: string, query: ProjectDataQuery): Promise<unknown> {
  const prismaFilters = (query.filters ?? []).filter((filter) => !filter.field.startsWith("data."));
  const memoryFilters = (query.filters ?? []).filter((filter) => filter.field.startsWith("data."));
  const where = { projectId, ...buildPrismaWhereFromFilters("records", prismaFilters, query.days) };

  if (query.operation === "count") {
    if (memoryFilters.length === 0) {
      return { count: await db.projectRecord.count({ where }) };
    }
    const rows = await db.projectRecord.findMany({ where, take: 500 });
    const serialized = rows.map((row) => ({
      collection: row.collection,
      userId: row.userId,
      chatId: row.chatId,
      createdAt: row.createdAt.toISOString(),
      data: parseRecordDataJson(row.dataJson),
    }));
    return { count: applyMemoryFilters(serialized, memoryFilters).length };
  }

  if (query.operation === "group_by" && query.groupBy) {
    const rows = await db.projectRecord.findMany({ where, take: 500 });
    const serialized = rows.map((row) => ({
      collection: row.collection,
      userId: row.userId,
      chatId: row.chatId,
      createdAt: row.createdAt.toISOString(),
      data: parseRecordDataJson(row.dataJson),
    }));
    const filtered = applyMemoryFilters(serialized, memoryFilters);
    return {
      groupBy: query.groupBy,
      items: groupRows(filtered, query.groupBy, clampLimit(query.limit, MAX_GROUP_LIMIT, 20)),
    };
  }

  const limit = clampLimit(query.limit, MAX_LIST_LIMIT, 25);
  const rows = await db.projectRecord.findMany({
    where,
    orderBy: query.sort
      ? {
          [query.sort.field === "data" ? "createdAt" : query.sort.field]:
            query.sort.direction ?? "asc",
        }
      : { createdAt: "desc" },
    take: memoryFilters.length > 0 ? 500 : limit,
  });

  const serialized = rows.map((row) => ({
    id: row.id,
    collection: row.collection,
    userId: row.userId,
    chatId: row.chatId,
    createdAt: row.createdAt.toISOString(),
    data: parseRecordDataJson(row.dataJson),
  }));

  const filtered = applyMemoryFilters(serialized, memoryFilters).slice(0, limit);
  return { items: filtered, count: filtered.length };
}

async function queryUserVariables(projectId: string, query: ProjectDataQuery): Promise<unknown> {
  const where = {
    projectId,
    ...buildPrismaWhereFromFilters("user_variables", query.filters ?? [], query.days),
  };

  if (query.operation === "count") {
    return { count: await db.projectUserVariable.count({ where }) };
  }

  if (query.operation === "group_by" && query.groupBy) {
    const rows = await db.projectUserVariable.findMany({ where, take: 2000 });
    const serialized = rows.map((row) => ({
      userId: row.userId,
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt.toISOString(),
    }));
    return {
      groupBy: query.groupBy,
      items: groupRows(serialized, query.groupBy, clampLimit(query.limit, MAX_GROUP_LIMIT, 20)),
    };
  }

  const limit = clampLimit(query.limit, MAX_LIST_LIMIT, 25);
  const rows = await db.projectUserVariable.findMany({
    where,
    orderBy: query.sort
      ? { [query.sort.field]: query.sort.direction ?? "asc" }
      : { updatedAt: "desc" },
    take: limit,
  });

  return {
    items: rows.map((row) => ({
      userId: row.userId,
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt.toISOString(),
    })),
    count: rows.length,
  };
}

/** Универсальный read-only запрос к данным проекта. */
export async function executeProjectDataQuery(
  projectId: string,
  raw: Record<string, unknown>,
): Promise<unknown> {
  const parsed = parseProjectDataQuery(raw);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  switch (parsed.entity) {
    case "bot_users":
      return queryBotUsers(projectId, parsed);
    case "bot_events":
      return queryBotEvents(projectId, parsed);
    case "records":
      return queryRecords(projectId, parsed);
    case "user_variables":
      return queryUserVariables(projectId, parsed);
    default:
      return { error: "Неизвестная сущность" };
  }
}
