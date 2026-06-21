import type { Edge, Node, Viewport } from "@xyflow/react";
import { normalizeAdminNotifyNodeData } from "@/lib/flow/admin-notify-node-utils";
import { normalizeAiReplyNodeData } from "@/lib/flow/ai-reply-node-utils";
import { withFlowBusEdgeType } from "@/lib/flow/branch-handle-utils";
import {
  isValidConditionSourceHandle,
  normalizeConditionNodeData,
} from "@/lib/flow/condition-node-utils";
import {
  isValidHttpRequestSourceHandle,
  normalizeHttpRequestNodeData,
} from "@/lib/flow/http-request-node-utils";
import { normalizeJsonExtractNodeData } from "@/lib/flow/json-extract-node-utils";
import {
  isValidMessageSourceHandle,
  normalizeMessageNodeData,
} from "@/lib/flow/message-node-utils";
import { normalizeSaveRecordNodeData } from "@/lib/flow/save-record-node-utils";
import {
  isValidSetVariableSourceHandle,
  normalizeSetVariableNodeData,
} from "@/lib/flow/set-variable-node-utils";
import { normalizeTriggerNodeData } from "@/lib/flow/trigger-node-utils";
import {
  isValidWaitInputSourceHandle,
  normalizeWaitInputNodeData,
} from "@/lib/flow/wait-input-node-utils";

export const FLOW_NODE_TYPES = [
  "trigger",
  "message",
  "condition",
  "set_variable",
  "wait_input",
  "http_request",
  "ai_reply",
  "admin_notify",
  "json_extract",
  "save_record",
] as const;
export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];

export type TriggerNodeData = {
  label: string;
  command: string;
  triggerType: "command" | "any_message" | "inactivity" | "payment_succeeded";
  inactivityHours?: number;
};

export type TelegramParseMode = "HTML" | "MarkdownV2" | null;

export type MessageAttachmentsMode = "album" | "documents" | "video_note" | "audio";

export type MessageAttachmentKind = "photo" | "video" | "document" | "video_note" | "audio";

export type MessageAttachment = {
  id: string;
  kind: MessageAttachmentKind;
  assetId: string;
  fileName?: string;
  hasSpoiler?: boolean;
  coverAssetId?: string;
};

export type InlineButton =
  | { id: string; text: string; kind: "callback" }
  | { id: string; text: string; kind: "url"; url: string }
  | { id: string; text: string; kind: "web_app"; webAppUrl: string }
  | { id: string; text: string; kind: "copy_text"; copyText: string }
  | { id: string; text: string; kind: "switch_inline"; switchInlineQuery: string };

export type ReplyKeyboardButton =
  | { id: string; text: string; kind: "text" }
  | { id: string; text: string; kind: "request_contact" }
  | { id: string; text: string; kind: "request_location" };

export type MessageKeyboard =
  | { type: "inline"; rows: InlineButton[][] }
  | { type: "reply"; rows: ReplyKeyboardButton[][]; oneTime?: boolean; resize?: boolean }
  | { type: "remove" };

export type MessageNodeData = {
  label: string;
  text?: string;
  parseMode?: TelegramParseMode;
  linkPreview?: boolean;
  attachmentsMode?: MessageAttachmentsMode;
  attachments?: MessageAttachment[];
  keyboard?: MessageKeyboard;
  showCaptionAboveMedia?: boolean;
  showTyping?: boolean;
  silent?: boolean;
  protectContent?: boolean;
  replyToUser?: boolean;
  delaySeconds?: number;
};

export type SetVariableValueSource = "literal" | "user_message" | "template";

export type SetVariableNodeData = {
  label: string;
  variableKey: string;
  valueSource: SetVariableValueSource;
  value?: string;
};

export type WaitInputNodeData = {
  label: string;
  variableKey: string;
};

export type HttpRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpRequestHeader = {
  key: string;
  value: string;
};

export type HttpRequestNodeData = {
  label: string;
  method: HttpRequestMethod;
  url: string;
  headers?: HttpRequestHeader[];
  body?: string;
  responseVariable?: string;
  responseStatusVariable?: string;
  timeoutMs?: number;
};

export type AiReplyNodeData = {
  label: string;
  systemPrompt: string;
};

export type AdminNotifyNodeData = {
  label: string;
  /** Чат для уведомления. Поддерживает шаблоны, напр. {{secret.ADMIN_CHAT_ID}}. */
  chatId: string;
  /** Текст уведомления (поддерживает {{var.*}} / {{secret.*}}). */
  text: string;
};

export type JsonExtractNodeData = {
  label: string;
  /** Ключ переменной с JSON-строкой (например, ответ http_request). */
  sourceVariable: string;
  /** Путь до значения: a.b.c, items[0].name. Пусто — весь объект. */
  path: string;
  /** Ключ переменной, куда записать извлечённое значение. */
  targetVariable: string;
};

export type SaveRecordField = {
  /** Имя поля записи. */
  key: string;
  /** Значение поля; поддерживает шаблоны {{var.*}} / {{nickname}}. */
  value: string;
};

export type SaveRecordNodeData = {
  label: string;
  /** Коллекция (таблица заявок), напр. "leads" или "orders". */
  collection: string;
  /** Поля записи. */
  fields: SaveRecordField[];
};

export type ConditionRule =
  | { id: string; type: "chat_member"; chatIds: string[]; chatMatchMode: "all" | "any" }
  | { id: string; type: "is_premium"; expected: boolean }
  | { id: string; type: "has_username"; expected: boolean }
  | { id: string; type: "start_param"; operator: "equals" | "contains"; value: string };

export type ConditionNodeData = {
  label: string;
  matchMode: "all" | "any";
  rules: ConditionRule[];
};

export type FlowSecretDeclaration = {
  key: string;
  label?: string;
  description?: string;
};

export type FlowVariableDeclaration = {
  key: string;
  label?: string;
  defaultValue?: string;
};

export type FlowNodeData =
  | TriggerNodeData
  | MessageNodeData
  | ConditionNodeData
  | SetVariableNodeData
  | WaitInputNodeData
  | HttpRequestNodeData
  | AiReplyNodeData
  | AdminNotifyNodeData
  | JsonExtractNodeData
  | SaveRecordNodeData;

export type FlowNode = Node<FlowNodeData, FlowNodeType>;
export type FlowEdge = Edge;
export type FlowViewport = Viewport;

export type BotFlowDocument = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: FlowViewport;
  secrets?: FlowSecretDeclaration[];
  variables?: FlowVariableDeclaration[];
};

export type FlowNodeTransientData = {
  isExiting?: boolean;
  isEntering?: boolean;
  revealIndex?: number;
  streamReveal?: boolean;
  /** Кнопки-«назад» этой ноды: handleId → подпись цели. Только для отрисовки. */
  backLinks?: Record<string, string>;
  /** Сторона коннектора для исходящих хендлов: handleId → "left|right|top|bottom". */
  handleSides?: Record<string, "left" | "right" | "top" | "bottom">;
  /** У ноды есть исходящее ребро через хендл "next" — нужно отрисовать его даже при наличии кнопок. */
  hasNextEdge?: boolean;
};

export function stripFlowNodeTransientData(data: FlowNodeData): FlowNodeData {
  const {
    isExiting: _isExiting,
    isEntering: _isEntering,
    revealIndex: _revealIndex,
    streamReveal: _streamReveal,
    backLinks: _backLinks,
    handleSides: _handleSides,
    hasNextEdge: _hasNextEdge,
    ...rest
  } = data as FlowNodeData & FlowNodeTransientData;
  return rest as FlowNodeData;
}

export function migrateFlowDocument(doc: BotFlowDocument): BotFlowDocument {
  const messageNodeIds = new Set(
    doc.nodes.filter((node) => node.type === "message").map((node) => node.id),
  );

  const nodes = doc.nodes.map((node) => {
    if (node.type === "trigger") {
      return {
        ...node,
        data: normalizeTriggerNodeData(node.data as Partial<TriggerNodeData>),
      };
    }

    if (node.type === "ai_reply") {
      return {
        ...node,
        data: normalizeAiReplyNodeData(node.data as Partial<AiReplyNodeData>),
      };
    }

    if (node.type === "message") {
      return {
        ...node,
        data: normalizeMessageNodeData(node.data),
      };
    }

    if (node.type === "condition") {
      return {
        ...node,
        data: normalizeConditionNodeData(node.data),
      };
    }

    if (node.type === "set_variable") {
      return {
        ...node,
        data: normalizeSetVariableNodeData(node.data),
      };
    }

    if (node.type === "wait_input") {
      return {
        ...node,
        data: normalizeWaitInputNodeData(node.data),
      };
    }

    if (node.type === "http_request") {
      return {
        ...node,
        data: normalizeHttpRequestNodeData(node.data),
      };
    }

    if (node.type === "admin_notify") {
      return {
        ...node,
        data: normalizeAdminNotifyNodeData(node.data),
      };
    }

    if (node.type === "json_extract") {
      return {
        ...node,
        data: normalizeJsonExtractNodeData(node.data),
      };
    }

    if (node.type === "save_record") {
      return {
        ...node,
        data: normalizeSaveRecordNodeData(node.data),
      };
    }

    return node;
  });

  const edges = doc.edges.map((edge) => {
    if (!messageNodeIds.has(edge.source) || edge.sourceHandle) {
      return edge;
    }

    return { ...edge, sourceHandle: "next" };
  });

  return { ...doc, nodes, edges };
}

export function sanitizeFlowDocument(doc: BotFlowDocument): BotFlowDocument {
  const migrated = migrateFlowDocument(doc);

  return {
    ...migrated,
    nodes: migrated.nodes.map(({ className: _className, data, ...node }) => ({
      ...node,
      data: stripFlowNodeTransientData(data),
    })),
    edges: migrated.edges.map(({ className: _className, ...edge }) => edge),
  };
}

export function pruneInvalidMessageEdges(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  return pruneInvalidEdges(nodes, edges);
}

export function pruneInvalidEdges(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return edges.filter((edge) => {
    const sourceNode = nodeById.get(edge.source);
    if (!sourceNode) {
      return true;
    }

    if (sourceNode.type === "message") {
      return isValidMessageSourceHandle(
        normalizeMessageNodeData(sourceNode.data),
        edge.sourceHandle,
      );
    }

    if (sourceNode.type === "condition") {
      return isValidConditionSourceHandle(edge.sourceHandle);
    }

    if (sourceNode.type === "http_request") {
      return isValidHttpRequestSourceHandle(edge.sourceHandle);
    }

    if (sourceNode.type === "set_variable") {
      return isValidSetVariableSourceHandle(edge.sourceHandle);
    }

    if (sourceNode.type === "wait_input") {
      return isValidWaitInputSourceHandle(edge.sourceHandle);
    }

    if (
      sourceNode.type === "admin_notify" ||
      sourceNode.type === "json_extract" ||
      sourceNode.type === "save_record"
    ) {
      return edge.sourceHandle == null || edge.sourceHandle === "next";
    }

    return true;
  });
}

function isFlowNodeType(value: unknown): value is FlowNodeType {
  return typeof value === "string" && FLOW_NODE_TYPES.includes(value as FlowNodeType);
}

function normalizeNode(raw: unknown): FlowNode | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const node = raw as Partial<FlowNode>;
  if (typeof node.id !== "string" || !isFlowNodeType(node.type)) {
    return null;
  }

  const position =
    node.position &&
    typeof node.position === "object" &&
    typeof node.position.x === "number" &&
    typeof node.position.y === "number"
      ? node.position
      : { x: 0, y: 0 };

  const data = node.data && typeof node.data === "object" ? node.data : { label: "Узел" };
  let cleanData = stripFlowNodeTransientData(data as FlowNodeData);

  if (node.type === "trigger") {
    cleanData = normalizeTriggerNodeData(cleanData as Partial<TriggerNodeData>);
  }

  if (node.type === "ai_reply") {
    cleanData = normalizeAiReplyNodeData(cleanData as Partial<AiReplyNodeData>);
  }

  if (node.type === "message") {
    cleanData = normalizeMessageNodeData(cleanData);
  }

  if (node.type === "condition") {
    cleanData = normalizeConditionNodeData(cleanData);
  }

  if (node.type === "set_variable") {
    cleanData = normalizeSetVariableNodeData(cleanData);
  }

  if (node.type === "wait_input") {
    cleanData = normalizeWaitInputNodeData(cleanData);
  }

  if (node.type === "http_request") {
    cleanData = normalizeHttpRequestNodeData(cleanData);
  }

  if (node.type === "admin_notify") {
    cleanData = normalizeAdminNotifyNodeData(cleanData);
  }

  if (node.type === "json_extract") {
    cleanData = normalizeJsonExtractNodeData(cleanData);
  }

  if (node.type === "save_record") {
    cleanData = normalizeSaveRecordNodeData(cleanData);
  }

  return {
    id: node.id,
    type: node.type,
    position,
    data: cleanData,
  };
}

function normalizeEdge(raw: unknown): FlowEdge | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const edge = raw as Partial<FlowEdge>;
  if (
    typeof edge.id !== "string" ||
    typeof edge.source !== "string" ||
    typeof edge.target !== "string"
  ) {
    return null;
  }

  return withFlowBusEdgeType({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type,
  });
}

function normalizeFlowSecretDeclaration(raw: unknown): FlowSecretDeclaration | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Partial<FlowSecretDeclaration>;
  const key = typeof item.key === "string" ? item.key.trim() : "";
  if (!key) {
    return null;
  }

  return {
    key,
    ...(typeof item.label === "string" && item.label.trim() ? { label: item.label.trim() } : {}),
    ...(typeof item.description === "string" && item.description.trim()
      ? { description: item.description.trim() }
      : {}),
  };
}

function normalizeFlowVariableDeclaration(raw: unknown): FlowVariableDeclaration | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Partial<FlowVariableDeclaration>;
  const key = typeof item.key === "string" ? item.key.trim().replace(/^var\./, "") : "";
  if (!(key && /^[a-z][a-z0-9_]*$/.test(key))) {
    return null;
  }

  return {
    key,
    ...(typeof item.label === "string" && item.label.trim() ? { label: item.label.trim() } : {}),
    ...(typeof item.defaultValue === "string" ? { defaultValue: item.defaultValue } : {}),
  };
}

export function parseFlowJson(
  raw: string | null | undefined,
  fallback: BotFlowDocument,
): BotFlowDocument {
  if (!raw?.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BotFlowDocument>;
    const nodes = Array.isArray(parsed.nodes)
      ? parsed.nodes.map(normalizeNode).filter((node): node is FlowNode => node !== null)
      : [];
    const edges = Array.isArray(parsed.edges)
      ? parsed.edges.map(normalizeEdge).filter((edge): edge is FlowEdge => edge !== null)
      : [];

    if (nodes.length === 0) {
      const viewport =
        parsed.viewport &&
        typeof parsed.viewport === "object" &&
        typeof parsed.viewport.x === "number" &&
        typeof parsed.viewport.y === "number" &&
        typeof parsed.viewport.zoom === "number"
          ? parsed.viewport
          : fallback.viewport;

      return sanitizeFlowDocument({
        nodes: [],
        edges,
        viewport,
        ...(Array.isArray(parsed.secrets)
          ? {
              secrets: parsed.secrets
                .map(normalizeFlowSecretDeclaration)
                .filter((item): item is FlowSecretDeclaration => item !== null),
            }
          : {}),
        ...(Array.isArray(parsed.variables)
          ? {
              variables: parsed.variables
                .map(normalizeFlowVariableDeclaration)
                .filter((item): item is FlowVariableDeclaration => item !== null),
            }
          : {}),
      });
    }

    const viewport =
      parsed.viewport &&
      typeof parsed.viewport === "object" &&
      typeof parsed.viewport.x === "number" &&
      typeof parsed.viewport.y === "number" &&
      typeof parsed.viewport.zoom === "number"
        ? parsed.viewport
        : fallback.viewport;

    const secrets = Array.isArray(parsed.secrets)
      ? parsed.secrets
          .map(normalizeFlowSecretDeclaration)
          .filter((item): item is FlowSecretDeclaration => item !== null)
      : fallback.secrets;

    const variables = Array.isArray(parsed.variables)
      ? parsed.variables
          .map(normalizeFlowVariableDeclaration)
          .filter((item): item is FlowVariableDeclaration => item !== null)
      : fallback.variables;

    return migrateFlowDocument({ nodes, edges, viewport, secrets, variables });
  } catch {
    return fallback;
  }
}

export function serializeFlowJson(doc: BotFlowDocument): string {
  const sanitized = sanitizeFlowDocument(doc);

  return JSON.stringify({
    nodes: sanitized.nodes,
    edges: sanitized.edges,
    viewport: sanitized.viewport,
    ...(sanitized.secrets?.length ? { secrets: sanitized.secrets } : {}),
    ...(sanitized.variables?.length ? { variables: sanitized.variables } : {}),
  });
}

export function serializeFlowJsonForAi(doc: BotFlowDocument): string {
  const sanitized = sanitizeFlowDocument(doc);

  return JSON.stringify({
    nodes: sanitized.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      ...(node.data && typeof node.data === "object" ? node.data : {}),
    })),
    ...(sanitized.secrets?.length ? { secrets: sanitized.secrets } : {}),
    ...(sanitized.variables?.length ? { variables: sanitized.variables } : {}),
  });
}

export function createFlowNodeId(type: FlowNodeType): string {
  return `${type}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createDefaultNodeData(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case "trigger":
      return { label: "Триггер", command: "/start", triggerType: "command" };
    case "message":
      return { label: "Сообщение", text: "Новое сообщение", parseMode: "HTML" };
    case "condition":
      return { label: "Условие", matchMode: "all", rules: [] };
    case "set_variable":
      return {
        label: "Переменная",
        variableKey: "my_var",
        valueSource: "literal",
        value: "",
      };
    case "wait_input":
      return {
        label: "Ожидание ввода",
        variableKey: "user_input",
      };
    case "http_request":
      return {
        label: "HTTP-запрос",
        method: "GET",
        url: "https://api.example.com",
      };
    case "ai_reply":
      return { label: "AI-ответ", systemPrompt: "Отвечай на вопросы пользователя." };
    case "admin_notify":
      return {
        label: "Уведомить админа",
        chatId: "{{secret.ADMIN_CHAT_ID}}",
        text: "",
      };
    case "json_extract":
      return {
        label: "Извлечь из JSON",
        sourceVariable: "response",
        path: "",
        targetVariable: "extracted",
      };
    case "save_record":
      return {
        label: "Запись",
        collection: "leads",
        fields: [{ key: "name", value: "{{nickname}}" }],
      };
  }
}
