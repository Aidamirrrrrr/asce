import { findUnwiredBranchButtons } from "@/lib/flow/flow-button-wiring";
import { splitIntoTriggerLanes } from "@/lib/flow/flow-layout";
import type { BotFlowDocument, FlowNode } from "@/lib/flow/flow-schema";
import { normalizeMessageNodeData } from "@/lib/flow/message-node-utils";
import { inferSecretRecipesFromText } from "@/lib/flow/secret-recipes";

export type FlowValidationIssue = {
  severity: "error" | "warning";
  message: string;
  nodeLabel?: string;
};

/**
 * Эвристика «текст обрезан в конце» — высокоточные сигналы обрыва генерации:
 * незакрытая скобка или висящий соединительный знак на конце. Обычные тексты,
 * заканчивающиеся словом или конечной пунктуацией, НЕ помечаются (нет ложных срабатываний).
 */
function looksTruncatedText(rawText: string): boolean {
  // Убираем HTML-теги и хвостовые пробелы — смотрим на «человеческий» конец.
  const text = rawText.replace(/<[^>]*>/g, "").replace(/\s+$/g, "");
  if (!text) {
    return false;
  }

  const opens = (text.match(/[(（]/g) ?? []).length;
  const closes = (text.match(/[)）]/g) ?? []).length;
  if (opens > closes) {
    return true; // незакрытая скобка, напр. «… (FAQ»
  }

  // Висящий соединительный знак на конце (для не слишком коротких текстов).
  if (text.length > 12 && /[,:(«„\-—/]$/.test(text)) {
    return true;
  }

  return false;
}

function getNodeLabel(node: FlowNode): string {
  const data = node.data;
  if (
    data &&
    typeof data === "object" &&
    "label" in data &&
    typeof data.label === "string" &&
    data.label
  ) {
    return data.label;
  }
  return node.id;
}

function laneHasMultipleAnyMessageTriggers(lane: FlowNode[]): boolean {
  const anyMessageTriggers = lane.filter(
    (node) =>
      node.type === "trigger" &&
      node.data &&
      typeof node.data === "object" &&
      "triggerType" in node.data &&
      (node.data as { triggerType?: string }).triggerType === "any_message",
  );

  return anyMessageTriggers.length > 1;
}

function findInputPromptWithoutWaitInput(lane: FlowNode[]): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];

  for (let index = 0; index < lane.length - 1; index++) {
    const node = lane[index];
    if (node.type !== "message") {
      continue;
    }

    const text =
      node.data && typeof node.data === "object" && "text" in node.data
        ? String((node.data as { text?: string }).text ?? "")
        : "";
    const label = getNodeLabel(node);

    if (!/введите|укажите|напишите|отправьте/i.test(`${label} ${text}`)) {
      continue;
    }

    const next = lane[index + 1];
    if (next?.type === "wait_input") {
      continue;
    }

    if (next?.type === "trigger") {
      const triggerType =
        next.data && typeof next.data === "object" && "triggerType" in next.data
          ? (next.data as { triggerType?: string }).triggerType
          : undefined;
      if (triggerType === "any_message") {
        issues.push({
          severity: "error",
          message:
            "После запроса ввода стоит trigger any_message — внутри ветки используйте wait_input",
          nodeLabel: label,
        });
      }
    }

    if (next?.type === "set_variable") {
      const valueSource =
        next.data && typeof next.data === "object" && "valueSource" in next.data
          ? (next.data as { valueSource?: string }).valueSource
          : undefined;
      if (valueSource === "user_message") {
        issues.push({
          severity: "warning",
          message: "После запроса ввода лучше wait_input, а не set_variable с user_message",
          nodeLabel: label,
        });
      }
    }
  }

  return issues;
}

function findMissingPaymentSecrets(doc: BotFlowDocument): FlowValidationIssue[] {
  const nodeText = JSON.stringify(doc.nodes);
  const inferred = inferSecretRecipesFromText(nodeText);
  const declared = new Set((doc.secrets ?? []).map((secret) => secret.key));
  const missing = inferred.filter((entry) => !declared.has(entry.key));

  if (missing.length === 0) {
    return [];
  }

  return [
    {
      severity: "warning",
      message: `Не объявлены секреты: ${missing.map((entry) => entry.key).join(", ")}`,
    },
  ];
}

function findNodeContentIssues(doc: BotFlowDocument): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];

  for (const node of doc.nodes) {
    const data = node.data as Record<string, unknown>;
    const label = getNodeLabel(node);

    if (node.type === "message") {
      const text = typeof data.text === "string" ? data.text.trim() : "";
      const attachments = Array.isArray(data.attachments) ? data.attachments : [];
      if (!text && attachments.length === 0) {
        issues.push({
          severity: "error",
          message: "Пустой текст сообщения (и нет вложений) — Telegram не отправит такое",
          nodeLabel: label,
        });
      } else if (text && looksTruncatedText(text)) {
        issues.push({
          severity: "error",
          message:
            "Текст сообщения выглядит обрезанным (обрыв на полуслове, незакрытая скобка или висящий знак) — допишите его до конца через update_node",
          nodeLabel: label,
        });
      }
    }

    if (node.type === "condition") {
      const rules = Array.isArray(data.rules) ? data.rules : [];
      if (rules.length === 0) {
        issues.push({
          severity: "error",
          message: "У условия нет правил — оно всегда уходит в ветку «нет»",
          nodeLabel: label,
        });
      }
    }

    if (node.type === "http_request") {
      const url = typeof data.url === "string" ? data.url.trim() : "";
      const isTemplate = /\{\{.+\}\}/.test(url);
      if (!(url && (isTemplate || /^https?:\/\//i.test(url)))) {
        issues.push({
          severity: "error",
          message: "Некорректный URL HTTP-запроса (нужен http(s):// или шаблон {{...}})",
          nodeLabel: label,
        });
      }
    }

    if (node.type === "ai_reply") {
      const systemPrompt = typeof data.systemPrompt === "string" ? data.systemPrompt.trim() : "";
      if (!systemPrompt) {
        issues.push({
          severity: "warning",
          message: "Пустой systemPrompt у AI-ответа — задайте инструкцию для модели",
          nodeLabel: label,
        });
      }
    }

    if (node.type === "admin_notify") {
      const text = typeof data.text === "string" ? data.text.trim() : "";
      const chatId = typeof data.chatId === "string" ? data.chatId.trim() : "";
      if (!text) {
        issues.push({
          severity: "error",
          message: "Пустой текст уведомления админу — нечего отправлять",
          nodeLabel: label,
        });
      }
      if (!chatId) {
        issues.push({
          severity: "error",
          message: "Не задан чат для уведомления (ID или {{secret.ADMIN_CHAT_ID}})",
          nodeLabel: label,
        });
      }
    }

    if (node.type === "json_extract") {
      const sourceVariable =
        typeof data.sourceVariable === "string" ? data.sourceVariable.trim() : "";
      const targetVariable =
        typeof data.targetVariable === "string" ? data.targetVariable.trim() : "";
      if (!(sourceVariable && targetVariable)) {
        issues.push({
          severity: "error",
          message: "У json_extract нужны переменная-источник и переменная-результат",
          nodeLabel: label,
        });
      }
    }
  }

  return issues;
}

function findDuplicateIdsAndKeys(doc: BotFlowDocument): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];

  const seenIds = new Set<string>();
  const dupIds = new Set<string>();
  for (const node of doc.nodes) {
    if (seenIds.has(node.id)) {
      dupIds.add(node.id);
    }
    seenIds.add(node.id);
  }
  if (dupIds.size > 0) {
    issues.push({
      severity: "error",
      message: `Дублируются id узлов: ${[...dupIds].join(", ")}`,
    });
  }

  const declaredKeys = (doc.variables ?? []).map((variable) => variable.key);
  const seenKeys = new Set<string>();
  const dupKeys = new Set<string>();
  for (const key of declaredKeys) {
    if (seenKeys.has(key)) {
      dupKeys.add(key);
    }
    seenKeys.add(key);
  }
  if (dupKeys.size > 0) {
    issues.push({
      severity: "warning",
      message: `Переменные объявлены несколько раз: ${[...dupKeys].join(", ")}`,
    });
  }

  return issues;
}

function findUnconnectedBranches(doc: BotFlowDocument): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const handlesBySource = new Map<string, Set<string>>();

  for (const edge of doc.edges) {
    if (!edge.sourceHandle) {
      continue;
    }
    const set = handlesBySource.get(edge.source) ?? new Set<string>();
    set.add(edge.sourceHandle);
    handlesBySource.set(edge.source, set);
  }

  for (const node of doc.nodes) {
    const handles = handlesBySource.get(node.id) ?? new Set<string>();
    const label = getNodeLabel(node);

    if (node.type === "condition") {
      if (!handles.has("yes")) {
        issues.push({
          severity: "error",
          message: "У условия не подключена ветка «да»",
          nodeLabel: label,
        });
      }
      if (!handles.has("no")) {
        issues.push({
          severity: "warning",
          message:
            "У условия не подключена ветка «нет» — пользователь не получит ответа при отказе",
          nodeLabel: label,
        });
      }
    }

    if (node.type === "http_request") {
      if (!handles.has("success")) {
        issues.push({
          severity: "error",
          message: "У HTTP-запроса не подключена ветка «успех»",
          nodeLabel: label,
        });
      }
      if (!handles.has("error")) {
        issues.push({
          severity: "warning",
          message: "У HTTP-запроса не подключена ветка «ошибка» — сбой останется без ответа",
          nodeLabel: label,
        });
      }
    }
  }

  return issues;
}

function findTriggersWithoutOutgoing(doc: BotFlowDocument): FlowValidationIssue[] {
  const sourcesWithEdges = new Set(doc.edges.map((edge) => edge.source));

  return doc.nodes
    .filter((node) => node.type === "trigger" && !sourcesWithEdges.has(node.id))
    .map((node) => ({
      severity: "error" as const,
      message: "У триггера нет исходящей связи — бот ничего не сделает при срабатывании",
      nodeLabel: getNodeLabel(node),
    }));
}

function findUnreachableNodes(doc: BotFlowDocument): FlowValidationIssue[] {
  if (doc.nodes.length === 0) {
    return [];
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of doc.edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }

  const reachable = new Set<string>();
  const queue = doc.nodes.filter((node) => node.type === "trigger").map((node) => node.id);

  for (const id of queue) {
    reachable.add(id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  const unreachable = doc.nodes.filter(
    (node) => node.type !== "trigger" && !reachable.has(node.id),
  );

  return unreachable.map((node) => ({
    severity: "error" as const,
    message: "Узел недостижим из триггеров — добавь входящую связь или удали узел",
    nodeLabel: getNodeLabel(node),
  }));
}

export function validateFlowDocument(doc: BotFlowDocument): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const lanes = splitIntoTriggerLanes(doc.nodes);

  for (const lane of lanes) {
    if (laneHasMultipleAnyMessageTriggers(lane)) {
      issues.push({
        severity: "error",
        message:
          "В одной дорожке несколько trigger any_message — оставьте один (для свободного диалога)",
      });
    }

    issues.push(...findInputPromptWithoutWaitInput(lane));
  }

  const anyMessageCount = doc.nodes.filter(
    (node) =>
      node.type === "trigger" &&
      node.data &&
      typeof node.data === "object" &&
      "triggerType" in node.data &&
      (node.data as { triggerType?: string }).triggerType === "any_message",
  ).length;

  if (anyMessageCount > 3) {
    issues.push({
      severity: "warning",
      message: `Много триггеров any_message (${anyMessageCount}) — проверьте ветки ввода`,
    });
  }

  issues.push(...findMissingPaymentSecrets(doc));
  issues.push(...findInvalidInactivityTriggers(doc));
  issues.push(...findUnwiredCallbackButtons(doc));
  issues.push(...findSpuriousNextEdgesFromKeyboardMenus(doc));
  issues.push(...findNodeContentIssues(doc));
  issues.push(...findDuplicateIdsAndKeys(doc));
  issues.push(...findUnconnectedBranches(doc));
  issues.push(...findTriggersWithoutOutgoing(doc));
  issues.push(...findUnreachableNodes(doc));

  return issues;
}

function findUnwiredCallbackButtons(doc: BotFlowDocument): FlowValidationIssue[] {
  return findUnwiredBranchButtons(doc.nodes, doc.edges).map((issue) => ({
    severity: "error" as const,
    message: `Кнопка «${issue.buttonLabel}» ни к чему не подключена`,
    nodeLabel: issue.sourceLabel,
  }));
}

function findSpuriousNextEdgesFromKeyboardMenus(doc: BotFlowDocument): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const nodeById = new Map(doc.nodes.map((node) => [node.id, node]));

  for (const edge of doc.edges) {
    if ((edge.sourceHandle ?? "next") !== "next") {
      continue;
    }

    const source = nodeById.get(edge.source);
    if (source?.type !== "message") {
      continue;
    }

    const data = normalizeMessageNodeData(source.data);
    const hasBranchButtons =
      (data.keyboard?.type === "inline" &&
        data.keyboard.rows.some((row) => row.some((button) => button.kind === "callback"))) ||
      (data.keyboard?.type === "reply" &&
        data.keyboard.rows.some((row) => row.some((button) => button.kind === "text")));

    if (!hasBranchButtons) {
      continue;
    }

    const target = nodeById.get(edge.target);
    issues.push({
      severity: "error",
      message:
        `Лишняя связь «Далее» от меню с кнопками к «${target?.data?.label ?? edge.target}». ` +
        "Удали её или привяжи экран через connect_nodes с buttonText.",
      nodeLabel: source.data.label,
    });
  }

  return issues;
}

function findInvalidInactivityTriggers(doc: BotFlowDocument): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];

  for (const node of doc.nodes) {
    if (node.type !== "trigger") {
      continue;
    }

    const data = node.data as { triggerType?: string; inactivityHours?: number };
    if (data.triggerType !== "inactivity") {
      continue;
    }

    const hours = Number(data.inactivityHours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      issues.push({
        severity: "warning",
        message: "Триггер бездействия: укажите inactivityHours от 1 до 168",
        nodeLabel: node.data.label,
      });
    }
  }

  return issues;
}

export function formatFlowValidationSummary(issues: FlowValidationIssue[]): string | null {
  if (issues.length === 0) {
    return null;
  }

  const lines = issues.map((issue) => {
    const prefix = issue.severity === "error" ? "Ошибка" : "Замечание";
    const node = issue.nodeLabel ? ` («${issue.nodeLabel}»)` : "";
    return `• ${prefix}${node}: ${issue.message}`;
  });

  return `Проверка схемы:\n${lines.join("\n")}`;
}
