import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { runChatToolStep } from "@/lib/ai/ai-client";
import { FLOW_AGENT_MAX_STEPS } from "@/lib/ai/flow-agent-continue";
import { flowAgentLog, flowAgentWarn } from "@/lib/ai/flow-agent-log";
import { saveFlowAgentRun, type TelemetryStep } from "@/lib/ai/flow-agent-telemetry";
import type { FlowStreamCallbacks } from "@/lib/ai/flow-generator";
import {
  CONDITION_SECTION,
  KEYBOARD_SECTION,
  LINEAR_NODES_SECTION,
  NO_EMOJI_RULE,
  NODE_TYPES_SECTION,
  PAYMENTS_SECTION,
  TEMPLATES_SECTION,
  VARIABLES_AND_MESSAGE_SECTION,
} from "@/lib/ai/flow-prompt-sections";
import { findUnwiredBranchButtons } from "@/lib/flow/flow-button-wiring";
import { type BotFlowDocument, FLOW_NODE_TYPES } from "@/lib/flow/flow-schema";
import { applyFlowTool, describeNode, FLOW_TOOL_NAMES } from "@/lib/flow/flow-tools";
import { getMessageSourceHandles, normalizeMessageNodeData } from "@/lib/flow/message-node-utils";
import { applyLayoutToFlowDocument } from "@/lib/flow/normalize-generated-flow";
import {
  formatFlowValidationSummary,
  validateFlowDocument,
} from "@/lib/flow/validate-flow-document";
import { stripTextEmojis } from "@/lib/text/strip-emojis";

const MAX_STEPS = FLOW_AGENT_MAX_STEPS;
const MAX_CORRECTION_ROUNDS = 5;
/** Каждые N ходов переинъектим компактный снимок состояния (аналог компакции контекста). */
const STATE_REGROUND_EVERY = 6;
/** Финишная фаза «субагентов»: достраивание висящих веток в свежем контексте. */
const SUBAGENT_MAX_BRANCHES = 8;
const SUBAGENT_MAX_STEPS = 8;

const BRANCH_ENUM = ["next", "yes", "no", "success", "error"] as const;

const NODE_DATA_HINT =
  "Поля data зависят от типа узла (см. список типов). Передавай только нужные поля, остальные подставятся по умолчанию.";

// --- Тулзы планирования/самопроверки (живут в состоянии цикла, не в документе) ---
const PLAN_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "think",
      description:
        "ОБЯЗАТЕЛЕН ПЕРВЫМ — вызови до set_plan. Опиши в reasoning архитектуру бота из ТЗ: " +
        "сколько дорожек (triggers), какие пункты меню и сколько их, где ветки сходятся, " +
        "что идёт параллельно, в каком порядке строить. Для сложных сценариев это критично — " +
        "иначе ветки теряются при строительстве.",
      parameters: {
        type: "object",
        properties: {
          reasoning: {
            type: "string",
            description:
              "Архитектурный разбор: дорожки от триггеров, пункты меню, ветвления condition, " +
              "где ветки сходятся в общий узел, порядок строительства",
          },
        },
        required: ["reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_plan",
      description:
        "ВЫЗОВИ ПЕРВЫМ. Разбей ТЗ на список экранов/веток, которые построишь (по пункту на экран или ветку: меню, каждый раздел меню, каждая ветка выбора, сбор данных, сохранение, уведомления и т.д.). name — название бота для нового сценария. Затем строй по плану и отмечай mark_done.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
            description: "Пункты плана — что нужно построить, по одному на экран/ветку.",
          },
          name: { type: "string", description: "Название бота (для нового сценария)" },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_done",
      description:
        "Отметить пункт плана выполненным после того как соответствующий экран/ветка построены и подключены. index — номер пункта из set_plan.",
      parameters: {
        type: "object",
        properties: { index: { type: "number" } },
        required: ["index"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_issues",
      description:
        "Самопроверка перед finish: вернёт структурные проблемы (висящие кнопки, недостижимые узлы), обрезанные/неполные тексты сообщений и невыполненные пункты плана. Вызови, чтобы понять, что ещё достроить или дописать.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// --- Тулзы изменения документа (доступны и основному агенту, и субагентам) ---
const DOC_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_nodes",
      description: "Показать все узлы и связи текущей схемы (id, тип, label, краткое описание).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "find_nodes",
      description: "Найти узлы по подстроке в id/типе/label/содержимом.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Текст для поиска" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_node",
      description: `Создать узел и (опционально) подключить его после узла afterNodeId по ветке branch. ${NODE_DATA_HINT}`,
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...FLOW_NODE_TYPES] },
          data: { type: "object", description: "Поля данных узла", additionalProperties: true },
          afterNodeId: { type: "string", description: "id узла-источника для связи (опционально)" },
          branch: {
            type: "string",
            enum: [...BRANCH_ENUM],
            description:
              "Ветка от afterNodeId: next (линейно), yes/no (condition), success/error (http_request)",
          },
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_node",
      description: `Изменить поля данных существующего узла (мердж). ${NODE_DATA_HINT}`,
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          data: { type: "object", additionalProperties: true },
        },
        required: ["nodeId", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_node",
      description: "Удалить узел и все связи с ним.",
      parameters: {
        type: "object",
        properties: { nodeId: { type: "string" } },
        required: ["nodeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "connect_nodes",
      description:
        "Соединить два узла. branch — ветка источника (по умолчанию основная: yes/success/next). " +
        "buttonText — текст callback-кнопки сообщения-источника: используй его, чтобы привязать конкретную inline-кнопку к её узлу.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          branch: { type: "string", enum: [...BRANCH_ENUM] },
          buttonText: {
            type: "string",
            description:
              "Текст inline-кнопки сообщения-источника (точно как в клавиатуре). Привязывает эту кнопку к target.",
          },
        },
        required: ["source", "target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_branch",
      description: "Задать ветку (yes/no/success/error) от узла-источника к целевому узлу.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          branch: { type: "string", enum: [...BRANCH_ENUM] },
        },
        required: ["source", "target", "branch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description:
        "Завершить работу, когда схема готова и ВСЕ пункты плана закрыты. message — короткий отчёт пользователю (2-4 предложения), name — название бота (для нового сценария).",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          name: { type: "string" },
        },
        required: ["message"],
      },
    },
  },
];

export const FLOW_AGENT_TOOLS: ChatCompletionTool[] = [...PLAN_TOOLS, ...DOC_TOOLS];

const AGENT_WORKFLOW = `Ты собираешь схему Telegram-бота пошагово, вызывая инструменты (tools). НЕ возвращай JSON схемы в тексте — только вызовы инструментов.

Доступные инструменты: think, set_plan, mark_done, get_issues, ${FLOW_TOOL_NAMES.join(", ")}, finish.

Рабочий процесс:
- ШАГ 0 — АНАЛИЗ: первым вызови think — разбери архитектуру из ТЗ: сколько дорожек (triggers), какие пункты меню и сколько их, где ветки сходятся, что идёт параллельно, в каком порядке строить.
- ШАГ 1 — ПЛАН: после think вызови set_plan со списком ВСЕХ экранов/веток из ТЗ (меню, каждый раздел меню, каждая ветка выбора, сбор данных, сохранение, уведомления, доп. триггеры). Не пропускай разделы. name — название бота.
- Затем строй строго по плану. Закрыл экран/ветку и подключил — вызови mark_done(index).
- СКЕЛЕТ МЕНЮ: если меню содержит 3+ пункта — сначала построй trigger и message со ВСЕМИ кнопками (все тексты кнопок сразу в keyboard.buttons), только затем создавай и подключай содержимое каждой ветки по порядку. Это единственный способ не пропустить пункты при длинных сценариях.
- Для нового сценария начни с add_node типа trigger (команда /start), затем добавляй узлы цепочкой через afterNodeId.
- Для правки существующего сценария сначала вызови list_nodes, найди нужные узлы по id и меняй их (update_node/add_node/delete_node/connect_nodes).
- Добавляй узлы в порядке дорожек: trigger -> вся его цепочка -> следующий trigger. Это важно для аккуратной раскладки.
- Ветвление: от condition подключай ветку yes (основная) и ветку no через branch:"no"; от http_request — success и error (branch:"error").
- Связи между узлами создаются ТОЛЬКО инструментами connect_nodes/set_branch или параметром afterNodeId у add_node. Никаких edges в data.
- Inline-кнопки (меню/выбор): у сообщения с клавиатурой каждая callback-кнопка — отдельная ветка. Для КАЖДОЙ кнопки: add_node нужного узла (БЕЗ afterNodeId), затем connect_nodes(source=сообщение, target=узел, buttonText="точный текст кнопки"). НЕ связывай кнопочное меню через afterNodeId/next — иначе ветки склеятся в одну. КАЖДАЯ кнопка обязана вести на свой экран — пустых кнопок быть не должно.
- СХОЖДЕНИЕ веток: если после выбора у всех кнопок ОДИНАКОВОЕ продолжение — сбор имени, телефона, сохранение записи — то каждая ветка выбора должна вести в ОДИН И ТОТ ЖЕ следующий узел. Не дублируй сбор данных под каждую кнопку и НЕ обрывай ветки: создай общий wait_input/save_record один раз и подключи к нему ВСЕ ветки.
- НЕ оставляй линейный узел (set_variable/message/wait_input) без исходящей связи, если по смыслу сценарий должен продолжиться.
- ID БЕЗОПАСНОСТЬ: nodeId генерируется в момент создания — бери его только из результата add_node (поле nodeId) или из list_nodes. Не угадывай и не конструируй id вручную. Для inline-кнопок: сначала add_node (без afterNodeId) → получи nodeId из ответа → затем в СЛЕДУЮЩЕМ шаге connect_nodes(source=меню, target=полученный_nodeId, buttonText=...). Внутри одного шага нельзя использовать id узла, созданного в том же шаге — он ещё неизвестен.
- id узлов присваиваются автоматически — бери их из результата add_node (поле nodeId) или из list_nodes.
- ПЕРЕД finish вызови get_issues и устрани всё, что он покажет: висящие кнопки, недостижимые узлы, невыполненные пункты плана, ОБРЕЗАННЫЕ тексты.
- САМОПРОВЕРКА ТЕКСТОВ перед finish: перечитай ТЕКСТ КАЖДОГО message-узла. Он должен быть ЗАКОНЧЕННЫМ — без обрыва на полуслове, с закрытыми скобками и кавычками, со всем обещанным содержимым (списки услуг, контакты, ответы FAQ — полностью). Любой обрезанный/неполный текст допиши через update_node ДО вызова finish.
- Вызывай finish ТОЛЬКО когда все пункты плана отмечены mark_done и get_issues пуст. Частичную или обрезанную схему НЕ сдавай.
- ${NO_EMOJI_RULE}`;

/** Полный промпт для создания нового сценария — включает шаблоны архетипов. */
const FLOW_AGENT_CREATE_SYSTEM_PROMPT = [
  AGENT_WORKFLOW,
  NODE_TYPES_SECTION,
  CONDITION_SECTION,
  LINEAR_NODES_SECTION,
  VARIABLES_AND_MESSAGE_SECTION,
  KEYBOARD_SECTION,
  PAYMENTS_SECTION,
  TEMPLATES_SECTION,
].join("\n\n");

/**
 * Более компактный промпт для правки существующего сценария: без TEMPLATES_SECTION
 * (шаблоны архетипов не нужны при редактировании, только при создании с нуля).
 * Экономит ~800 токенов и сохраняет фокус на точечных изменениях.
 */
const FLOW_AGENT_REFINE_SYSTEM_PROMPT = [
  AGENT_WORKFLOW,
  NODE_TYPES_SECTION,
  CONDITION_SECTION,
  LINEAR_NODES_SECTION,
  VARIABLES_AND_MESSAGE_SECTION,
  KEYBOARD_SECTION,
  PAYMENTS_SECTION,
].join("\n\n");

const SUBAGENT_WORKFLOW = `Ты достраиваешь ОДНУ ветку уже существующей схемы Telegram-бота инструментами (tools). НЕ возвращай JSON в тексте.

Правила:
- Построй ТОЛЬКО запрошенную ветку. Не трогай и не дублируй чужие узлы.
- id существующих узлов бери из снимка состояния ниже или через list_nodes.
- Для привязки конкретной inline-кнопки используй connect_nodes(source=сообщение, target=узел, buttonText="точный текст кнопки").
- Внутри ветки соединяй узлы дальше, чтобы ни один новый узел не остался недостижимым.
- Когда ветка достроена и подключена — вызови finish с коротким отчётом.
- ${NO_EMOJI_RULE}`;

const SUBAGENT_SYSTEM_PROMPT = [
  SUBAGENT_WORKFLOW,
  NODE_TYPES_SECTION,
  CONDITION_SECTION,
  LINEAR_NODES_SECTION,
  VARIABLES_AND_MESSAGE_SECTION,
  KEYBOARD_SECTION,
].join("\n\n");

export type FlowAgentResult = {
  flow: BotFlowDocument;
  name?: string;
  assistantMessage: string;
  stepLimitReached?: boolean;
};

type PlanItem = { text: string; done: boolean };

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Короткий снимок аргументов для логов (без больших data-объектов). */
function summarizeToolArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = { tool };

  for (const [key, value] of Object.entries(args)) {
    if (key === "data" && value && typeof value === "object") {
      summary.dataKeys = Object.keys(value as Record<string, unknown>);
      continue;
    }
    if (typeof value === "string") {
      summary[key] = value.length > 120 ? `${value.slice(0, 120)}…` : value;
      continue;
    }
    summary[key] = value;
  }

  return summary;
}

function withLayout(doc: BotFlowDocument): BotFlowDocument {
  return applyLayoutToFlowDocument(doc);
}

/**
 * Компактный снимок схемы для модели вместо полного JSON: id/тип/label + кнопки
 * у сообщений + связи. Держит контекст лёгким при длинных сессиях; детали узла
 * модель добирает через find_nodes/list_nodes.
 */
function buildStateDigest(doc: BotFlowDocument): string {
  const labelById = new Map(doc.nodes.map((node) => [node.id, describeNode(node).label]));

  const nodeLines = doc.nodes.map((node) => {
    const digest = describeNode(node);
    let extra = "";
    if (node.type === "message") {
      const buttons = getMessageSourceHandles(normalizeMessageNodeData(node.data))
        .filter((handle) => handle.id !== "next")
        .map((handle) => `«${handle.label}»`);
      if (buttons.length > 0) {
        extra = ` | кнопки: ${buttons.join(", ")}`;
      }
    }
    return `- ${digest.id} [${digest.type}] ${digest.label}${
      digest.summary ? ` — ${digest.summary}` : ""
    }${extra}`;
  });

  const edgeLines = doc.edges.map((edge) => {
    const src = labelById.get(edge.source) ?? edge.source;
    const tgt = labelById.get(edge.target) ?? edge.target;
    return `- «${src}» --${edge.sourceHandle ?? "next"}--> «${tgt}»`;
  });

  return `Узлы:\n${nodeLines.join("\n") || "—"}\n\nСвязи:\n${edgeLines.join("\n") || "—"}`;
}

function buildPlanChecklist(plan: PlanItem[]): string {
  if (plan.length === 0) {
    return "";
  }
  const lines = plan.map((item, index) => `${item.done ? "[x]" : "[ ]"} ${index}. ${item.text}`);
  return `План:\n${lines.join("\n")}`;
}

/**
 * Расширенный снимок для режима правки: полный текст message-узлов вместо
 * 80-символьного обрезка. Позволяет модели точно видеть что редактирует.
 */
function buildDetailedStateDigest(doc: BotFlowDocument): string {
  const labelById = new Map(doc.nodes.map((node) => [node.id, describeNode(node).label]));

  const nodeLines = doc.nodes.map((node) => {
    const digest = describeNode(node);
    let summaryPart = digest.summary ? ` — ${digest.summary}` : "";
    let extra = "";

    if (node.type === "message") {
      const data = node.data as Record<string, unknown>;
      const text = typeof data.text === "string" ? data.text.trim() : "";
      summaryPart = text ? ` — "${text}"` : "";
      const buttons = getMessageSourceHandles(normalizeMessageNodeData(node.data))
        .filter((handle) => handle.id !== "next")
        .map((handle) => `«${handle.label}»`);
      if (buttons.length > 0) {
        extra = ` | кнопки: ${buttons.join(", ")}`;
      }
    }

    return `- ${digest.id} [${digest.type}] ${digest.label}${summaryPart}${extra}`;
  });

  const edgeLines = doc.edges.map((edge) => {
    const src = labelById.get(edge.source) ?? edge.source;
    const tgt = labelById.get(edge.target) ?? edge.target;
    return `- «${src}» --${edge.sourceHandle ?? "next"}--> «${tgt}»`;
  });

  return `Узлы:\n${nodeLines.join("\n") || "—"}\n\nСвязи:\n${edgeLines.join("\n") || "—"}`;
}

/** Количество последних сообщений, которые сохраняются при прореживании контекста. */
const CONTEXT_PRUNE_KEEP_RECENT = 16;

/**
 * Прореживание истории перед STATE_REGROUND: сохраняем system-промпт, первое
 * сообщение пользователя (оригинальная инструкция) и последние N сообщений.
 * Старые tool-exchanges убираем — актуальное состояние документа уже в снимке
 * STATE_REGROUND, который добавляется сразу после вызова этой функции.
 */
function pruneContextAtReground(
  messages: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  if (messages.length <= 2 + CONTEXT_PRUNE_KEEP_RECENT) {
    return messages;
  }
  const system = messages[0];
  const firstUser = messages[1];
  const recent = messages.slice(-CONTEXT_PRUNE_KEEP_RECENT);
  return [system, firstUser, ...recent];
}

/**
 * Семантически богатый снимок прогресса для инъекции при STATE_REGROUND.
 * Заменяет сырую обрезку истории содержательным резюме: что уже построено,
 * что осталось, сколько узлов каких типов. Модель получает "память" о сделанном
 * без нагрузки на контекст от длинных tool-exchanges.
 */
function buildProgressSummary(
  doc: BotFlowDocument,
  plan: PlanItem[],
  instruction: string,
): string {
  const goalSnippet = instruction.trim().slice(0, 250);

  const typeCounts: Record<string, number> = {};
  for (const node of doc.nodes) {
    typeCounts[node.type] = (typeCounts[node.type] ?? 0) + 1;
  }
  const typeCountStr =
    Object.entries(typeCounts)
      .map(([type, count]) => `${type}×${count}`)
      .join(", ") || "—";

  const done = plan.filter((item) => item.done);
  const remaining = plan.filter((item) => !item.done);

  const parts: string[] = [
    `Цель: ${goalSnippet}`,
    `Схема: ${doc.nodes.length} узлов (${typeCountStr}), ${doc.edges.length} связей`,
  ];

  if (done.length > 0) {
    parts.push(
      `Выполнено (${done.length}/${plan.length}): ${done.map((i) => i.text).join("; ")}`,
    );
  }
  if (remaining.length > 0) {
    parts.push(`Осталось: ${remaining.map((i) => i.text).join("; ")}`);
  }

  return parts.join("\n");
}

const UNREACHABLE_ISSUE_PATTERN = /недостижим|ни к чему не подключена/i;

/**
 * Структурные проблемы, которые агент ОБЯЗАН починить перед finish: все ошибки,
 * недостижимые узлы и неподключённые кнопки.
 */
function structuralBlockingSummary(doc: BotFlowDocument): string | null {
  const blocking = validateFlowDocument(doc).filter(
    (issue) => issue.severity === "error" || UNREACHABLE_ISSUE_PATTERN.test(issue.message),
  );
  return formatFlowValidationSummary(blocking);
}

/** Полный список того, что мешает finish: структура + невыполненные пункты плана. */
function buildBlockingTodo(doc: BotFlowDocument, plan: PlanItem[]): string | null {
  const structural = structuralBlockingSummary(doc);
  const remaining = plan.filter((item) => !item.done);

  if (!structural && remaining.length === 0) {
    return null;
  }

  const parts: string[] = [];
  if (structural) {
    parts.push(`Структурные проблемы:\n${structural}`);
  }
  if (remaining.length > 0) {
    parts.push(
      `Невыполненные пункты плана:\n${remaining.map((item) => `- ${item.text}`).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

const CORRECTION_HINT =
  "ВАЖНО: «Кнопка ни к чему не подключена» почти всегда значит, что для неё ещё НЕТ экрана — " +
  "не оставляй её висеть и не вызывай finish. Для каждой такой кнопки: " +
  "1) создай экран — add_node (обычно type=message) с нужным текстом; " +
  "2) свяжи его — connect_nodes с source=узел-меню, target=новый узел, buttonText=точный текст кнопки. " +
  "Если узел недостижим — скорее всего ты использовал choice там, где нужен message с inline-кнопками. " +
  "choice имеет ОДИН выход next — он не может вести в разные экраны. " +
  "Исправь: замени choice на message с inline-кнопками и подключи каждую кнопку к своему экрану через connect_nodes. " +
  "Закрытые пункты отмечай mark_done. Достраивай по ТЗ ВСЕ ветки до конца, и только потом вызывай finish. " +
  "Если указан обрезанный текст сообщения — перечитай его и допиши до конца через update_node (полный текст, закрытые скобки/кавычки).";

function buildInitialUserMessage(
  mode: "create" | "refine",
  instruction: string,
  doc: BotFlowDocument,
): string {
  if (mode === "refine") {
    return `Текущая схема (полные данные):\n${buildDetailedStateDigest(doc)}\n\nИнструкция пользователя:\n${instruction.trim()}\n\nСначала вызови think (архитектурный разбор правки), затем set_plan с пунктами правки, затем меняй схему инструментами (сохраняй id существующих узлов). В конце — get_issues и finish.`;
  }
  return `Создай сценарий Telegram-бота по описанию, вызывая инструменты. Сначала вызови think (архитектурный разбор), затем set_plan, затем строй по плану. В конце — get_issues и finish.\n\nОписание:\n${instruction.trim()}`;
}

export type FlowAgentStepFn = (
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
) => Promise<ChatCompletionMessage | undefined>;

/** Выполнить doc-мутирующий tool-call, вернуть результат для протокола сообщений. */
function runDocTool(
  doc: BotFlowDocument,
  name: string,
  args: Record<string, unknown>,
): { doc: BotFlowDocument; changed: boolean; content: string } {
  const result = applyFlowTool(doc, name, args);
  if (result.ok) {
    const content =
      result.data !== undefined
        ? `${result.summary}\n${JSON.stringify(result.data)}`
        : result.summary;
    return { doc: result.doc, changed: true, content };
  }
  return { doc, changed: false, content: `Ошибка: ${result.error}` };
}

/**
 * Субагент со СВЕЖИМ контекстом достраивает одну висящую ветку. Работает над тем же
 * документом (узлы имеют уникальные id, так что merge — это просто возвращённый doc).
 */
async function runFocusedSubagent(input: {
  doc: BotFlowDocument;
  focus: string;
  step: FlowAgentStepFn;
  callbacks?: FlowStreamCallbacks;
}): Promise<BotFlowDocument> {
  let doc = input.doc;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SUBAGENT_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Текущее состояние схемы:\n${buildStateDigest(doc)}\n\n${input.focus}`,
    },
  ];

  for (let i = 0; i < SUBAGENT_MAX_STEPS; i += 1) {
    let message: ChatCompletionMessage | undefined;
    try {
      message = await input.step(messages, DOC_TOOLS);
    } catch (error) {
      flowAgentWarn("subagent step failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      break;
    }

    const toolCalls = message?.tool_calls ?? [];
    if (toolCalls.length === 0) {
      break;
    }

    messages.push({ role: "assistant", content: message?.content ?? "", tool_calls: toolCalls });

    let finished = false;
    let changed = false;
    for (const call of toolCalls) {
      if (call.type !== "function") {
        continue;
      }
      if (call.function.name === "finish") {
        finished = true;
        messages.push({ role: "tool", tool_call_id: call.id, content: "ok" });
        continue;
      }
      const args = parseToolArguments(call.function.arguments);
      const outcome = runDocTool(doc, call.function.name, args);
      doc = outcome.doc;
      changed = changed || outcome.changed;
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
    }

    if (changed) {
      doc = withLayout(doc);
      input.callbacks?.onPartialFlow?.(doc, doc.nodes.length);
    }
    if (finished) {
      break;
    }
  }

  return doc;
}

/**
 * Финишная фаза: если основной агент сдал схему с висящими кнопками, по одной
 * отдаём каждую такую ветку отдельному субагенту со свежим контекстом
 * (divide-and-conquer). Каждую кнопку пробуем максимум один раз — цикл конечен.
 */
async function completeDanglingBranches(input: {
  doc: BotFlowDocument;
  instruction: string;
  step: FlowAgentStepFn;
  callbacks?: FlowStreamCallbacks;
}): Promise<BotFlowDocument> {
  let doc = input.doc;
  const attempted = new Set<string>();

  for (let round = 0; round < SUBAGENT_MAX_BRANCHES; round += 1) {
    const issue = findUnwiredBranchButtons(doc.nodes, doc.edges).find(
      (candidate) => !attempted.has(`${candidate.sourceId}:${candidate.handleId}`),
    );
    if (!issue) {
      break;
    }

    attempted.add(`${issue.sourceId}:${issue.handleId}`);
    flowAgentLog("subagent branch", {
      round: round + 1,
      sourceId: issue.sourceId,
      button: issue.buttonLabel,
    });

    const focus = `У сообщения «${issue.sourceLabel}» (id ${issue.sourceId}) кнопка «${issue.buttonLabel}» никуда не ведёт. Построй ТОЛЬКО ветку этой кнопки по общему ТЗ ниже: создай нужные экраны/шаги и подключи их (привязку кнопки делай через connect_nodes с buttonText="${issue.buttonLabel}"). Не трогай другие ветки. В конце finish.\n\nОбщее ТЗ:\n${input.instruction.trim()}`;

    doc = await runFocusedSubagent({ doc, focus, step: input.step, callbacks: input.callbacks });
  }

  return doc;
}

/**
 * Агентный tool-calling цикл: модель строит/правит BotFlowDocument вызовами тулзов.
 * Бросает исключение (для отката на JSON-пайплайн), если модель не воспользовалась
 * инструментами или шлюз не поддерживает function-calling.
 */
export async function runFlowAgent(input: {
  mode: "create" | "refine";
  baseDoc: BotFlowDocument;
  instruction: string;
  callbacks?: FlowStreamCallbacks;
  projectId?: string;
  /** Точка внедрения для тестов; по умолчанию — реальный вызов ИИ-провайдера. */
  step?: FlowAgentStepFn;
  /** Финишная фаза достраивания висящих веток субагентами (по умолчанию включена). */
  useSubagents?: boolean;
}): Promise<FlowAgentResult> {
  const { mode, baseDoc, instruction, callbacks, projectId } = input;
  const step = input.step ?? runChatToolStep;

  let doc: BotFlowDocument = baseDoc;
  let assistantMessage = "";
  let flowName: string | undefined;
  let usedTool = false;
  let correctionRounds = 0;
  let plan: PlanItem[] = [];

  const telemetrySteps: TelemetryStep[] = [];
  const runStartedAt = Date.now();

  const systemPrompt =
    mode === "create" ? FLOW_AGENT_CREATE_SYSTEM_PROMPT : FLOW_AGENT_REFINE_SYSTEM_PROMPT;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildInitialUserMessage(mode, instruction, doc) },
  ];

  flowAgentLog("start", {
    mode,
    baseNodeCount: baseDoc.nodes.length,
    instructionLength: instruction.trim().length,
    maxSteps: MAX_STEPS,
    maxCorrectionRounds: MAX_CORRECTION_ROUNDS,
  });

  let exitReason = "max_steps_reached";

  for (let iteration = 0; iteration < MAX_STEPS; iteration += 1) {
    flowAgentLog("iteration", {
      step: iteration + 1,
      maxSteps: MAX_STEPS,
      correctionRounds,
      planTotal: plan.length,
      planDone: plan.filter((item) => item.done).length,
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
      messageCount: messages.length,
    });

    // Периодическое переинъектирование снимка — модель не теряет фокус на длинных сессиях.
    if (iteration > 0 && iteration % STATE_REGROUND_EVERY === 0) {
      // Прореживаем старые tool-exchanges — актуальное состояние уже в снимке ниже.
      const pruned = pruneContextAtReground(messages);
      messages.splice(0, messages.length, ...pruned);

      const progress = buildProgressSummary(doc, plan, instruction);
      const checklist = buildPlanChecklist(plan);
      messages.push({
        role: "user",
        content: `=== СНИМОК ПРОГРЕССА ===\n${progress}\n\nТекущая схема:\n${buildStateDigest(doc)}${
          checklist ? `\n\n${checklist}` : ""
        }\n\nПродолжай по плану; не вызывай finish, пока есть невыполненные пункты или структурные проблемы.`,
      });
    }

    let message: ChatCompletionMessage | undefined;
    const stepStartedAt = Date.now();
    try {
      message = await step(messages, FLOW_AGENT_TOOLS);
    } catch (error) {
      flowAgentWarn("step failed", {
        step: iteration + 1,
        durationMs: Date.now() - stepStartedAt,
        usedTool,
        nodeCount: doc.nodes.length,
        message: error instanceof Error ? error.message : String(error),
      });
      if (!usedTool || doc.nodes.length === 0) {
        throw error;
      }
      exitReason = "llm_step_error_with_progress";
      break;
    }
    const toolCalls = message?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      const content = typeof message?.content === "string" ? message.content : "";
      if (content.trim()) {
        assistantMessage = content.trim();
      }

      flowAgentLog("no tool calls", {
        step: iteration + 1,
        durationMs: Date.now() - stepStartedAt,
        textLength: content.trim().length,
      });

      const todo = buildBlockingTodo(doc, plan);
      if (todo && correctionRounds < MAX_CORRECTION_ROUNDS) {
        correctionRounds += 1;
        flowAgentWarn("correction round (no tools)", {
          step: iteration + 1,
          correctionRound: correctionRounds,
          maxCorrectionRounds: MAX_CORRECTION_ROUNDS,
          validationPreview: todo.slice(0, 300),
        });
        messages.push({ role: "assistant", content: message?.content ?? "" });
        messages.push({
          role: "user",
          content: `Схема ещё не готова — доделай инструментами и снова вызови finish:\n${todo}\n\n${CORRECTION_HINT}`,
        });
        continue;
      }
      exitReason =
        todo && correctionRounds >= MAX_CORRECTION_ROUNDS
          ? "no_tool_calls_blocking"
          : "no_tool_calls";
      break;
    }

    usedTool = true;
    messages.push({ role: "assistant", content: message?.content ?? "", tool_calls: toolCalls });

    let finished = false;
    let docChanged = false;

    for (const call of toolCalls) {
      if (call.type !== "function") {
        flowAgentWarn("skipped non-function tool call", { type: call.type });
        continue;
      }

      const name = call.function.name;
      const args = parseToolArguments(call.function.arguments);

      // --- Тулзы планирования/самопроверки (состояние цикла) ---
      if (name === "set_plan") {
        const items = Array.isArray(args.items)
          ? (args.items as unknown[])
              .filter(
                (value): value is string => typeof value === "string" && value.trim().length > 0,
              )
              .map((text) => ({ text: text.trim(), done: false }))
          : [];
        plan = items;
        if (typeof args.name === "string" && args.name.trim()) {
          flowName = args.name.trim();
        }
        flowAgentLog("tool set_plan", { step: iteration + 1, items: items.length });
        telemetrySteps.push({ stepIndex: iteration, toolName: name, outcome: "meta", iterDurMs: Date.now() - stepStartedAt });
        callbacks?.onPlan?.(plan.map((item) => item.text));
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `План принят: ${items.length} пунктов. Строй ВСЕ по порядку, после каждого вызывай mark_done(index). Не вызывай finish, пока не закрыты все пункты и get_issues не пуст.`,
        });
        continue;
      }

      if (name === "mark_done") {
        const index = typeof args.index === "number" ? args.index : Number(args.index);
        if (Number.isInteger(index) && plan[index]) {
          plan[index].done = true;
        }
        const remaining = plan.filter((item) => !item.done).length;
        telemetrySteps.push({ stepIndex: iteration, toolName: name, outcome: "meta", iterDurMs: Date.now() - stepStartedAt });
        callbacks?.onPlanProgress?.(
          plan.flatMap((item, itemIndex) => (item.done ? [itemIndex] : [])),
        );
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Отмечено. Осталось пунктов плана: ${remaining}.`,
        });
        continue;
      }

      if (name === "get_issues") {
        const todo = buildBlockingTodo(doc, plan);
        telemetrySteps.push({ stepIndex: iteration, toolName: name, outcome: "meta", iterDurMs: Date.now() - stepStartedAt });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: todo ? `Ещё не готово:\n${todo}` : "Проблем не найдено — можно вызывать finish.",
        });
        continue;
      }

      if (name === "think") {
        const reasoning = typeof args.reasoning === "string" ? args.reasoning.trim() : "";
        flowAgentLog("tool think", { step: iteration + 1, reasoningLength: reasoning.length });
        telemetrySteps.push({ stepIndex: iteration, toolName: name, outcome: "meta", iterDurMs: Date.now() - stepStartedAt });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: "Разбор принят. Теперь вызови set_plan со списком всех пунктов сборки.",
        });
        continue;
      }

      if (name === "finish") {
        finished = true;
        if (typeof args.message === "string" && args.message.trim()) {
          assistantMessage = args.message.trim();
        }
        if (typeof args.name === "string" && args.name.trim()) {
          flowName = args.name.trim();
        }
        flowAgentLog("tool finish", {
          step: iteration + 1,
          hasName: Boolean(flowName),
          messageLength: assistantMessage.length,
        });
        telemetrySteps.push({ stepIndex: iteration, toolName: name, outcome: "meta", iterDurMs: Date.now() - stepStartedAt });
        messages.push({ role: "tool", tool_call_id: call.id, content: "ok" });
        continue;
      }

      // --- Doc-мутирующие тулзы ---
      const outcome = runDocTool(doc, name, args);
      if (outcome.changed) {
        doc = outcome.doc;
        docChanged = true;
        flowAgentLog("tool ok", {
          step: iteration + 1,
          tool: name,
          summary: outcome.content.split("\n")[0],
        });
        telemetrySteps.push({ stepIndex: iteration, toolName: name, outcome: "ok", iterDurMs: Date.now() - stepStartedAt });
      } else {
        flowAgentWarn("tool error", {
          step: iteration + 1,
          tool: name,
          args: summarizeToolArgs(name, args),
          error: outcome.content,
        });
        telemetrySteps.push({ stepIndex: iteration, toolName: name, outcome: "error", errorText: outcome.content.slice(0, 300), iterDurMs: Date.now() - stepStartedAt });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
    }

    if (docChanged) {
      const layoutStartedAt = Date.now();
      doc = withLayout(doc);
      flowAgentLog("layout applied", {
        step: iteration + 1,
        durationMs: Date.now() - layoutStartedAt,
        nodeCount: doc.nodes.length,
        edgeCount: doc.edges.length,
      });
      callbacks?.onPartialFlow?.(doc, doc.nodes.length);
    }

    if (finished) {
      const todo = buildBlockingTodo(doc, plan);
      if (todo && correctionRounds < MAX_CORRECTION_ROUNDS) {
        correctionRounds += 1;
        flowAgentWarn("correction round (finish blocked)", {
          step: iteration + 1,
          correctionRound: correctionRounds,
          maxCorrectionRounds: MAX_CORRECTION_ROUNDS,
          validationPreview: todo.slice(0, 300),
        });
        messages.push({
          role: "user",
          content: `Рано для finish — схема ещё не готова:\n${todo}\n\n${CORRECTION_HINT}`,
        });
        continue;
      }
      exitReason =
        todo && correctionRounds >= MAX_CORRECTION_ROUNDS ? "finish_blocked" : "finish_ok";
      break;
    }
  }

  if (!usedTool || doc.nodes.length === 0) {
    flowAgentWarn("abort — no tools used", { usedTool, nodeCount: doc.nodes.length, exitReason });
    throw new Error("Агент не воспользовался инструментами — откат на JSON-генерацию");
  }

  // Финишная фаза: достроить субагентами висящие ветки, которые основной агент бросил.
  if (input.useSubagents !== false && findUnwiredBranchButtons(doc.nodes, doc.edges).length > 0) {
    const before = doc.nodes.length;
    flowAgentLog("subagents start", {
      danglingButtons: findUnwiredBranchButtons(doc.nodes, doc.edges).length,
      nodeCount: before,
    });
    doc = await completeDanglingBranches({ doc, instruction, step, callbacks });
    doc = withLayout(doc);
    flowAgentLog("subagents done", {
      addedNodes: doc.nodes.length - before,
      remainingDangling: findUnwiredBranchButtons(doc.nodes, doc.edges).length,
    });
  }

  flowAgentLog("loop exit", {
    exitReason,
    correctionRounds,
    planDone: plan.filter((item) => item.done).length,
    planTotal: plan.length,
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
    assistantMessageLength: assistantMessage.length,
  });

  saveFlowAgentRun(
    {
      projectId,
      mode,
      instruction,
      exitReason,
      totalSteps: telemetrySteps.length,
      nodeCountStart: baseDoc.nodes.length,
      nodeCountEnd: doc.nodes.length,
      durationMs: Date.now() - runStartedAt,
    },
    telemetrySteps,
  );

  return {
    flow: withLayout(doc),
    name: flowName,
    assistantMessage: stripTextEmojis(
      assistantMessage.trim() ||
        (mode === "create" ? "Сценарий собран на холсте." : "Сценарий обновлён на холсте."),
    ),
    stepLimitReached: exitReason === "max_steps_reached",
  };
}
