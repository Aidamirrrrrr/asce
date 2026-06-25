import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import {
  createStreamingChatCompletion,
  getAiClient,
  getAiModel,
  meterChatUsage,
} from "@/lib/ai/ai-client";
import {
  activeUsers,
  countUsers,
  errorsStats,
  eventsByType,
  funnelByNode,
  messagesCount,
  newUsers,
  topCommands,
} from "@/lib/analytics/bot-analytics-queries";
import {
  describeProjectDataSchema,
  executeProjectDataQuery,
} from "@/lib/analytics/project-data-query";
import {
  countProjectRecords,
  listProjectCollections,
  listProjectRecords,
} from "@/lib/bot/project-records";
import { parsePresentActionCardArgs } from "@/lib/chat/parse-action-card";
import type { ChatActionCard, ProjectChatMessage } from "@/lib/projects";
import { stripTextEmojis } from "@/lib/text/strip-emojis";

type ToolArgs = Record<string, unknown>;

function numberArg(args: ToolArgs, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArg(args: ToolArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Диспетчер инструментов — все строго scoped по projectId. */
const TOOL_HANDLERS: Record<string, (projectId: string, args: ToolArgs) => Promise<unknown>> = {
  count_users: (projectId) => countUsers(projectId),
  active_users: (projectId, args) => activeUsers(projectId, numberArg(args, "days") ?? 7),
  new_users: (projectId, args) => newUsers(projectId, numberArg(args, "days") ?? 7),
  messages_count: (projectId, args) =>
    messagesCount(projectId, {
      direction:
        args.direction === "in" || args.direction === "out" || args.direction === "all"
          ? args.direction
          : "all",
      days: numberArg(args, "days"),
    }),
  events_by_type: (projectId, args) => eventsByType(projectId, numberArg(args, "days")),
  top_commands: (projectId, args) =>
    topCommands(projectId, { days: numberArg(args, "days"), limit: numberArg(args, "limit") }),
  funnel_by_node: (projectId, args) =>
    funnelByNode(projectId, { days: numberArg(args, "days"), limit: numberArg(args, "limit") }),
  errors_stats: (projectId, args) =>
    errorsStats(projectId, { days: numberArg(args, "days"), limit: numberArg(args, "limit") }),
  list_record_collections: (projectId) => listProjectCollections(projectId),
  count_records: (projectId, args) =>
    countProjectRecords(projectId, stringArg(args, "collection"), numberArg(args, "days")),
  list_recent_records: (projectId, args) =>
    listProjectRecords({
      projectId,
      collection: stringArg(args, "collection"),
      limit: numberArg(args, "limit") ?? 20,
      days: numberArg(args, "days"),
    }),
  describe_project_data: async () => describeProjectDataSchema(),
  query_project_data: (projectId, args) => executeProjectDataQuery(projectId, args),
  present_action_card: async (_projectId, args) => {
    const parsed = parsePresentActionCardArgs(args);
    if ("error" in parsed) {
      return { error: parsed.error };
    }
    return { card: parsed };
  },
};

const DAYS_PARAM = {
  type: "number",
  description: "Период в днях (необязательно). Без него — за всё время.",
} as const;

const LIMIT_PARAM = {
  type: "number",
  description: "Максимум элементов в ответе (необязательно).",
} as const;

const FILTER_SCHEMA = {
  type: "array",
  description: "Фильтры. Для полей заявки: data.name, data.phone и т.д.",
  items: {
    type: "object",
    properties: {
      field: { type: "string" },
      op: {
        type: "string",
        enum: ["eq", "ne", "contains", "gt", "gte", "lt", "lte", "in"],
      },
      value: {},
    },
    required: ["field", "op"],
  },
} as const;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "describe_project_data",
      description:
        "Схема данных проекта: сущности, поля, операции. Вызови первым, если не уверен в структуре.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "query_project_data",
      description:
        "Гибкий read-only запрос к данным бота. entity: bot_users | bot_events | records | user_variables. operation: count | list | group_by. Фильтры, сортировка, лимит, days.",
      parameters: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            enum: ["bot_users", "bot_events", "records", "user_variables"],
          },
          operation: { type: "string", enum: ["count", "list", "group_by"] },
          days: DAYS_PARAM,
          filters: FILTER_SCHEMA,
          groupBy: { type: "string", description: "Поле для group_by" },
          sort: {
            type: "object",
            properties: {
              field: { type: "string" },
              direction: { type: "string", enum: ["asc", "desc"] },
            },
          },
          limit: LIMIT_PARAM,
        },
        required: ["entity", "operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "present_action_card",
      description:
        "Показать в чате карточку подтверждения с кнопками. Используй для опасных действий (удаление заявок и т.д.): сначала query_project_data, затем эту карточку + краткий текст в ответе. Обязательны actions (включая cancel) и pendingAction.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          body: { type: "string", description: "Детали для карточки (markdown)" },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "confirm или cancel" },
                label: { type: "string" },
                variant: { type: "string", enum: ["default", "destructive", "outline"] },
              },
              required: ["id", "label"],
            },
          },
          pendingAction: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["delete_records"] },
              params: {
                type: "object",
                properties: {
                  days: {
                    type: "number",
                    description: "Удалить записи СТАРШЕ N дней",
                  },
                  collection: { type: "string" },
                },
              },
            },
            required: ["type", "params"],
          },
        },
        required: ["actions", "pendingAction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_users",
      description: "Общее число пользователей бота и сколько из них заблокировали бота.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "active_users",
      description: "Сколько пользователей были активны за последние N дней.",
      parameters: { type: "object", properties: { days: DAYS_PARAM } },
    },
  },
  {
    type: "function",
    function: {
      name: "new_users",
      description: "Сколько новых пользователей пришло за последние N дней.",
      parameters: { type: "object", properties: { days: DAYS_PARAM } },
    },
  },
  {
    type: "function",
    function: {
      name: "messages_count",
      description: "Число сообщений: входящих (in), исходящих (out) или всех (all).",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["in", "out", "all"] },
          days: DAYS_PARAM,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "events_by_type",
      description: "Разбивка событий бота по типам (message_in/out, command, callback, error...).",
      parameters: { type: "object", properties: { days: DAYS_PARAM } },
    },
  },
  {
    type: "function",
    function: {
      name: "top_commands",
      description: "Топ команд, которые отправляли пользователи.",
      parameters: { type: "object", properties: { days: DAYS_PARAM, limit: LIMIT_PARAM } },
    },
  },
  {
    type: "function",
    function: {
      name: "funnel_by_node",
      description: "Сколько раз исполнялась каждая нода сценария (воронка по нодам).",
      parameters: { type: "object", properties: { days: DAYS_PARAM, limit: LIMIT_PARAM } },
    },
  },
  {
    type: "function",
    function: {
      name: "errors_stats",
      description: "Число ошибок выполнения сценария и последние сообщения об ошибках.",
      parameters: { type: "object", properties: { days: DAYS_PARAM, limit: LIMIT_PARAM } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_record_collections",
      description:
        "Список коллекций заявок/записей, собранных ботом (узел save_record), с количеством в каждой.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "count_records",
      description: "Сколько заявок/записей сохранено ботом (всего или в указанной коллекции).",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            description: "Имя коллекции (необязательно). Без него — по всем коллекциям.",
          },
          days: DAYS_PARAM,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_records",
      description: "Последние заявки/записи с полями data (имя, телефон и т.д.), датой и userId.",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            description: "Фильтр по коллекции (необязательно).",
          },
          days: DAYS_PARAM,
          limit: LIMIT_PARAM,
        },
      },
    },
  },
];

const SYSTEM_PROMPT = `Ты — ассистент владельца Telegram-бота. Отвечай на вопросы о пользователях, активности, заявках и собранных данных бота.
Используй ТОЛЬКО предоставленные инструменты — не выдумывай данные.
Для сложных вопросов предпочитай query_project_data (при необходимости сначала describe_project_data).
Для удаления или других опасных операций: сначала посчитай/найди данные через query_project_data, затем вызови present_action_card с pendingAction и кнопками confirm/cancel. Сам ничего не удаляй без карточки.
Короткие агрегаты можно брать из специализированных инструментов (count_users и т.д.).
Если данных нет — честно скажи об этом.
Отвечай кратко и по-русски. Не используй эмодзи.`;

export type AnalyticsToolCallTrace = {
  name: string;
  arguments: ToolArgs;
  result: unknown;
};

export type AnalyticsAnswer = {
  answer: string;
  toolCalls: AnalyticsToolCallTrace[];
  actionCard?: ChatActionCard;
};

export type QaAgentCallbacks = {
  onToolStatus?: (message: string) => void;
  onAssistantDelta?: (delta: string) => void;
  onAssistantReset?: () => void;
};

function toolStatusLabel(name: string): string {
  const labels: Record<string, string> = {
    describe_project_data: "Смотрю схему данных…",
    query_project_data: "Запрашиваю данные…",
    count_users: "Считаю пользователей…",
    active_users: "Считаю активных пользователей…",
    new_users: "Считаю новых пользователей…",
    messages_count: "Считаю сообщения…",
    events_by_type: "Смотрю события…",
    top_commands: "Смотрю команды…",
    funnel_by_node: "Смотрю воронку…",
    errors_stats: "Смотрю ошибки…",
    list_record_collections: "Смотрю заявки…",
    count_records: "Считаю заявки…",
    list_recent_records: "Загружаю заявки…",
    present_action_card: "Готовлю подтверждение…",
  };

  return labels[name] ?? "Ищу данные…";
}

async function runTool(
  projectId: string,
  name: string,
  args: ToolArgs,
): Promise<{ result: unknown }> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { result: { error: `Неизвестный инструмент: ${name}` } };
  }
  try {
    return { result: await handler(projectId, args) };
  } catch (error) {
    return { result: { error: error instanceof Error ? error.message : "Ошибка инструмента" } };
  }
}

function parseToolArguments(raw: string | undefined): ToolArgs {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ToolArgs) : {};
  } catch {
    return {};
  }
}

function buildHistoryMessages(chatHistory: ProjectChatMessage[]): ChatCompletionMessageParam[] {
  return chatHistory
    .slice(-8)
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: message.content,
    }));
}

/**
 * Q&A-агент: function-calling цикл поверх ИИ-эндпоинта (OpenAI-совместимый API).
 * Если шлюз не поддерживает tools — падаем в fallback со снимком всех агрегатов.
 */
export async function answerProjectDataQuestion(
  projectId: string,
  question: string,
  chatHistory: ProjectChatMessage[] = [],
  callbacks?: QaAgentCallbacks,
): Promise<AnalyticsAnswer> {
  const model = getAiModel();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...buildHistoryMessages(chatHistory),
    { role: "user", content: question },
  ];
  const trace: AnalyticsToolCallTrace[] = [];
  let pendingActionCard: ChatActionCard | undefined;

  try {
    for (let step = 0; step < 10; step += 1) {
      let streamedContent = false;
      const { content, toolCalls } = await createStreamingChatCompletion(
        {
          model,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
        },
        {
          onContentDelta: (delta) => {
            streamedContent = true;
            callbacks?.onAssistantDelta?.(delta);
          },
        },
      );

      if (toolCalls.length === 0) {
        const answer = content.trim();
        if (answer) {
          return {
            answer: stripTextEmojis(answer),
            toolCalls: trace,
            actionCard: pendingActionCard,
          };
        }
        break;
      }

      if (streamedContent) {
        callbacks?.onAssistantReset?.();
      }

      messages.push({
        role: "assistant",
        content,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        if (call.type !== "function") {
          continue;
        }
        callbacks?.onToolStatus?.(toolStatusLabel(call.function.name));
        const args = parseToolArguments(call.function.arguments);
        const { result } = await runTool(projectId, call.function.name, args);
        trace.push({ name: call.function.name, arguments: args, result });

        if (
          call.function.name === "present_action_card" &&
          result &&
          typeof result === "object" &&
          "card" in result &&
          result.card
        ) {
          pendingActionCard = result.card as ChatActionCard;
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Цикл завершился без финального текста — формируем ответ из собранных данных.
    return answerFromSnapshot(projectId, question, trace, chatHistory, callbacks);
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      // Вероятно, tools не поддержаны — fallback на снимок.
      return answerFromSnapshot(projectId, question, trace, chatHistory, callbacks);
    }
    throw error;
  }
}

/** @deprecated Используйте answerProjectDataQuestion */
export async function answerAnalyticsQuestion(
  projectId: string,
  question: string,
): Promise<AnalyticsAnswer> {
  return answerProjectDataQuestion(projectId, question);
}

/** Fallback: собрать снимок всех агрегатов и попросить модель ответить без tools. */
async function answerFromSnapshot(
  projectId: string,
  question: string,
  trace: AnalyticsToolCallTrace[],
  chatHistory: ProjectChatMessage[] = [],
  callbacks?: QaAgentCallbacks,
): Promise<AnalyticsAnswer> {
  const [users, active7, new7, messages7, byType, commands, errors, collections, recordsCount] =
    await Promise.all([
      countUsers(projectId),
      activeUsers(projectId, 7),
      newUsers(projectId, 7),
      messagesCount(projectId, { direction: "all", days: 7 }),
      eventsByType(projectId),
      topCommands(projectId, { limit: 10 }),
      errorsStats(projectId, { limit: 5 }),
      listProjectCollections(projectId),
      countProjectRecords(projectId),
    ]);

  const snapshot = {
    users,
    activeUsersLast7Days: active7,
    newUsersLast7Days: new7,
    messagesLast7Days: messages7,
    eventsByType: byType,
    topCommands: commands,
    errors,
    recordCollections: collections,
    recordsTotal: recordsCount.total,
  };

  const client = getAiClient();
  const model = getAiModel();
  const snapshotPrompt = `Данные бота (JSON):\n${JSON.stringify(snapshot, null, 2)}\n\nВопрос: ${question}\n\nОтветь, опираясь только на эти данные.`;

  const answer = callbacks?.onAssistantDelta
    ? stripTextEmojis(
        (
          await createStreamingChatCompletion(
            {
              model,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...buildHistoryMessages(chatHistory),
                { role: "user", content: snapshotPrompt },
              ],
            },
            { onContentDelta: callbacks.onAssistantDelta },
          )
        ).content.trim(),
      )
    : stripTextEmojis(
        extractSnapshotAnswer(
          await client.chat.completions.create({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...buildHistoryMessages(chatHistory),
              { role: "user", content: snapshotPrompt },
            ],
          }),
        ),
      );

  return {
    answer: answer || "Не удалось сформировать ответ по доступным данным.",
    toolCalls: trace,
  };
}

function extractSnapshotAnswer(response: OpenAI.Chat.Completions.ChatCompletion): string {
  meterChatUsage(response);
  const content = response.choices[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}
