import {
  extractCompleteJsonObjectsFromArray,
  extractJsonFromAiResponse,
  unescapeJsonStringFragment,
} from "@/lib/ai/stream-json-utils";
import { normalizeAdminNotifyNodeData } from "@/lib/flow/admin-notify-node-utils";
import { normalizeChoiceNodeData } from "@/lib/flow/choice-node-utils";
import { createConditionRuleId, normalizeConditionNodeData } from "@/lib/flow/condition-node-utils";
import { normalizeFormNodeData } from "@/lib/flow/form-node-utils";
import { normalizeJumpNodeData } from "@/lib/flow/jump-node-utils";
import {
  findBestButtonTarget,
  getBranchableMessageHandles,
  repairMessageButtonEdges,
} from "@/lib/flow/flow-button-wiring";
import { buildDagreNodePositions } from "@/lib/flow/flow-dagre-layout";
import { buildRowNodePosition, splitIntoTriggerLanes } from "@/lib/flow/flow-layout";
import {
  type BotFlowDocument,
  type ConditionRule,
  createDefaultNodeData,
  createFlowNodeId,
  FLOW_NODE_TYPES,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
  type FlowSecretDeclaration,
  type FlowVariableDeclaration,
  type HttpRequestMethod,
  type MessageAttachmentsMode,
  type MessageKeyboard,
  type SetVariableValueSource,
  sanitizeFlowDocument,
  type TriggerNodeData,
} from "@/lib/flow/flow-schema";
import { normalizeHttpRequestNodeData } from "@/lib/flow/http-request-node-utils";
import { normalizeJsonExtractNodeData } from "@/lib/flow/json-extract-node-utils";
import { createMessageButtonId, normalizeMessageNodeData } from "@/lib/flow/message-node-utils";
import { normalizeSaveRecordNodeData } from "@/lib/flow/save-record-node-utils";
import {
  isValidVariableKey,
  normalizeSetVariableNodeData,
  normalizeVariableKey,
} from "@/lib/flow/set-variable-node-utils";
import { clampButtonText } from "@/lib/flow/telegram-button-limits";
import { normalizeInactivityHours } from "@/lib/flow/trigger-node-utils";
import { normalizeWaitInputNodeData } from "@/lib/flow/wait-input-node-utils";
import { stripTextEmojis, stripTextEmojisOptional } from "@/lib/text/strip-emojis";

/** Явная ветка узла относительно предыдущего condition/http_request. */
export type GeneratedNodeBranch = "yes" | "no" | "success" | "error";

export type GeneratedFlowNodeSpec = {
  id?: string;
  branch?: GeneratedNodeBranch;
  type: FlowNodeType;
  label: string;
  command?: string;
  triggerType?: "command" | "any_message" | "inactivity" | "payment_succeeded";
  inactivityHours?: number;
  text?: string;
  parseMode?: "HTML" | "MarkdownV2" | null;
  linkPreview?: boolean;
  keyboard?: MessageKeyboard;
  attachmentsMode?: MessageAttachmentsMode;
  showCaptionAboveMedia?: boolean;
  showTyping?: boolean;
  silent?: boolean;
  protectContent?: boolean;
  replyToUser?: boolean;
  delaySeconds?: number;
  matchMode?: "all" | "any";
  rules?: unknown[];
  variableKey?: string;
  valueSource?: SetVariableValueSource;
  value?: string;
  method?: HttpRequestMethod;
  url?: string;
  headers?: Array<{ key: string; value: string }>;
  body?: string;
  responseVariable?: string;
  responseStatusVariable?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  chatId?: string;
  sourceVariable?: string;
  path?: string;
  targetVariable?: string;
  collection?: string;
  fields?: Array<{ key: string; value: string }>;
  extractions?: Array<{ path: string; variableKey: string }>;
  prompt?: string;
  options?: Array<{ text: string; value?: string }>;
  targetNodeId?: string;
  questions?: Array<{ prompt: string; variableKey: string; type?: string }>;
};

export type GeneratedFlowSpec = {
  name?: string;
  assistantMessage?: string;
  secrets?: FlowSecretDeclaration[];
  variables?: FlowVariableDeclaration[];
  nodes: GeneratedFlowNodeSpec[];
};

function buildGeneratedNodePosition(index: number): { x: number; y: number } {
  return buildRowNodePosition(index);
}

/** Единая раскладка графа — дерево слева-направо через dagre. */
export function applyLayoutToFlowDocument(doc: BotFlowDocument): BotFlowDocument {
  if (doc.nodes.length === 0) {
    return doc;
  }

  const edges = repairMessageButtonEdges(doc.nodes, doc.edges);
  const positions = buildDagreNodePositions(doc.nodes, edges);

  return {
    ...doc,
    edges,
    nodes: doc.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
  };
}

/** Ручное выравнивание на холсте использует тот же алгоритм. */
export const applyAlignLayoutToFlowDocument = applyLayoutToFlowDocument;

const HTTP_ERROR_BRANCH_PATTERN = /ошиб|error|не удалось|повтор|сбой|failed|проблем|не получилось/i;
const CONDITION_NO_BRANCH_PATTERN =
  /отказ|не прош|не выполн|не подписк|отклон|не подходит|нет доступа/i;

function getNodeBranchText(node: FlowNode): string {
  const label = typeof node.data?.label === "string" ? node.data.label : "";

  if (
    node.type === "message" &&
    node.data &&
    typeof node.data === "object" &&
    "text" in node.data
  ) {
    const text = typeof node.data.text === "string" ? node.data.text : "";
    return `${label} ${text}`;
  }

  return label;
}

function findBranchTarget(
  nodes: FlowNode[],
  fromIndex: number,
  pattern: RegExp,
): FlowNode | undefined {
  for (let index = fromIndex + 1; index < nodes.length; index++) {
    const candidate = nodes[index];
    if (candidate.type === "message" && pattern.test(getNodeBranchText(candidate))) {
      return candidate;
    }
  }

  const fallback = nodes[fromIndex + 2];
  return fallback?.type === "message" ? fallback : undefined;
}

export type BranchByNodeId = Map<string, GeneratedNodeBranch>;

/** Найти первый последующий узел, явно помеченный нужной веткой (branch). */
function findExplicitBranchTarget(
  nodes: FlowNode[],
  fromIndex: number,
  branch: GeneratedNodeBranch,
  branchByNodeId: BranchByNodeId | undefined,
): FlowNode | undefined {
  if (!branchByNodeId) {
    return undefined;
  }
  for (let index = fromIndex + 1; index < nodes.length; index++) {
    if (branchByNodeId.get(nodes[index].id) === branch) {
      return nodes[index];
    }
  }
  return undefined;
}

function linearEdgeKey(sourceId: string, targetId: string): string {
  return `${sourceId}->${targetId}`;
}

function buildMessageButtonEdges(
  node: FlowNode,
  nodes: FlowNode[],
  index: number,
  edges: FlowEdge[],
  skipLinear: Set<string>,
): void {
  const branchHandles = getBranchableMessageHandles(node);
  if (branchHandles.length === 0) {
    return;
  }

  const usedTargetIds = new Set<string>();
  const assignedTargets: FlowNode[] = [];

  for (let buttonIndex = 0; buttonIndex < branchHandles.length; buttonIndex++) {
    const handle = branchHandles[buttonIndex]!;
    const target = findBestButtonTarget(nodes, index, handle.label, usedTargetIds);

    if (!target || usedTargetIds.has(target.id)) {
      continue;
    }

    usedTargetIds.add(target.id);
    assignedTargets.push(target);
    edges.push({
      id: `e-${node.id}-${handle.id}-${target.id}`,
      source: node.id,
      target: target.id,
      sourceHandle: handle.id,
    });
  }

  const immediateNext = nodes[index + 1];
  if (immediateNext && usedTargetIds.has(immediateNext.id)) {
    skipLinear.add(linearEdgeKey(node.id, immediateNext.id));
  }

  const _targetIndices = assignedTargets
    .map((target) => nodes.findIndex((candidate) => candidate.id === target.id))
    .filter((targetIndex) => targetIndex >= 0)
    .sort((left, right) => left - right);

  for (let leftIndex = 0; leftIndex < assignedTargets.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < assignedTargets.length; rightIndex++) {
      const from = assignedTargets[leftIndex]!;
      const to = assignedTargets[rightIndex]!;
      skipLinear.add(linearEdgeKey(from.id, to.id));
    }
  }
}

function isBranchTargetNode(nodeId: string, edges: FlowEdge[]): boolean {
  return edges.some(
    (edge) =>
      edge.target === nodeId &&
      (edge.sourceHandle?.startsWith("btn-") ||
        edge.sourceHandle?.startsWith("reply-") ||
        edge.sourceHandle === "yes" ||
        edge.sourceHandle === "no" ||
        edge.sourceHandle === "success" ||
        edge.sourceHandle === "error"),
  );
}

function buildGeneratedEdges(nodes: FlowNode[], branchByNodeId?: BranchByNodeId): FlowEdge[] {
  const edges: FlowEdge[] = [];
  const skipLinear = new Set<string>();

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const next = nodes[index + 1];

    if (node.type === "http_request") {
      // Явная ветка успеха имеет приоритет над «следующим узлом».
      const explicitSuccess = findExplicitBranchTarget(nodes, index, "success", branchByNodeId);
      const explicitError = findExplicitBranchTarget(nodes, index, "error", branchByNodeId);
      const successTarget =
        explicitSuccess ?? (next && next.id !== explicitError?.id ? next : undefined);

      if (successTarget) {
        edges.push({
          id: `e-${node.id}-success-${successTarget.id}`,
          source: node.id,
          target: successTarget.id,
          sourceHandle: "success",
        });
      }

      const errorTarget =
        explicitError ?? findBranchTarget(nodes, index, HTTP_ERROR_BRANCH_PATTERN);
      if (errorTarget && errorTarget.id !== successTarget?.id) {
        edges.push({
          id: `e-${node.id}-error-${errorTarget.id}`,
          source: node.id,
          target: errorTarget.id,
          sourceHandle: "error",
        });

        if (successTarget && errorTarget.id === nodes[index + 2]?.id) {
          skipLinear.add(linearEdgeKey(successTarget.id, errorTarget.id));
        }
      }

      continue;
    }

    if (node.type === "condition") {
      const explicitYes = findExplicitBranchTarget(nodes, index, "yes", branchByNodeId);
      const explicitNo = findExplicitBranchTarget(nodes, index, "no", branchByNodeId);
      const yesTarget = explicitYes ?? (next && next.id !== explicitNo?.id ? next : undefined);

      if (yesTarget) {
        edges.push({
          id: `e-${node.id}-yes-${yesTarget.id}`,
          source: node.id,
          target: yesTarget.id,
          sourceHandle: "yes",
        });
      }

      const noTarget = explicitNo ?? findBranchTarget(nodes, index, CONDITION_NO_BRANCH_PATTERN);
      if (noTarget && noTarget.id !== yesTarget?.id) {
        edges.push({
          id: `e-${node.id}-no-${noTarget.id}`,
          source: node.id,
          target: noTarget.id,
          sourceHandle: "no",
        });

        if (yesTarget && noTarget.id === nodes[index + 2]?.id) {
          skipLinear.add(linearEdgeKey(yesTarget.id, noTarget.id));
        }
      }

      continue;
    }

    if (node.type === "message") {
      buildMessageButtonEdges(node, nodes, index, edges, skipLinear);
    }
  }

  for (let index = 0; index < nodes.length - 1; index++) {
    const node = nodes[index];
    const next = nodes[index + 1];

    if (node.type === "condition" || node.type === "http_request" || node.type === "jump") {
      continue;
    }

    if (node.type === "message" && getBranchableMessageHandles(node).length > 0) {
      continue;
    }

    if (skipLinear.has(linearEdgeKey(node.id, next.id))) {
      continue;
    }

    if (isBranchTargetNode(node.id, edges) && isBranchTargetNode(next.id, edges)) {
      continue;
    }

    if (isBranchTargetNode(next.id, edges)) {
      continue;
    }

    edges.push({
      id: `e-${node.id}-${next.id}`,
      source: node.id,
      target: next.id,
      ...(node.type === "message" ||
      node.type === "set_variable" ||
      node.type === "wait_input" ||
      node.type === "choice" ||
      node.type === "form"
        ? { sourceHandle: "next" }
        : {}),
    });
  }

  return edges;
}

type GeneratedKeyboardInput = {
  type?: string;
  buttons?: unknown[][];
  rows?: unknown[][];
  oneTime?: boolean;
  resize?: boolean;
};

function parseGeneratedKeyboard(raw: unknown): MessageKeyboard | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const keyboard = raw as GeneratedKeyboardInput;

  if (keyboard.type === "remove") {
    return { type: "remove" };
  }

  const sourceRows = Array.isArray(keyboard.rows)
    ? keyboard.rows
    : Array.isArray(keyboard.buttons)
      ? keyboard.buttons
      : null;

  if (!sourceRows) {
    return undefined;
  }

  if (keyboard.type === "inline") {
    const rows = sourceRows
      .map((row) =>
        Array.isArray(row)
          ? row
              .map((item) => parseGeneratedInlineButton(item))
              .filter(
                (button): button is NonNullable<ReturnType<typeof parseGeneratedInlineButton>> =>
                  button !== null,
              )
          : [],
      )
      .filter((row) => row.length > 0);

    return rows.length > 0 ? { type: "inline", rows } : undefined;
  }

  if (keyboard.type === "reply") {
    const rows = sourceRows
      .map((row) =>
        Array.isArray(row)
          ? row
              .map((item) => parseGeneratedReplyButton(item))
              .filter(
                (button): button is NonNullable<ReturnType<typeof parseGeneratedReplyButton>> =>
                  button !== null,
              )
          : [],
      )
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      return undefined;
    }

    return {
      type: "reply",
      rows,
      ...(keyboard.oneTime === true ? { oneTime: true } : {}),
      ...(keyboard.resize !== false ? { resize: true } : { resize: false }),
    };
  }

  return undefined;
}

function parseGeneratedInlineButton(raw: unknown) {
  if (typeof raw === "string" && raw.trim()) {
    return {
      id: createMessageButtonId(),
      text: clampButtonText(stripTextEmojis(raw.trim())),
      kind: "callback" as const,
    };
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const button = raw as Record<string, unknown>;
  if (typeof button.text !== "string" || !button.text.trim()) {
    return null;
  }

  const id = createMessageButtonId();
  const text = clampButtonText(stripTextEmojis(button.text.trim()));
  const kind = button.kind;

  if (kind === "url" && typeof button.url === "string" && button.url.trim()) {
    return { id, text, kind: "url" as const, url: button.url.trim() };
  }

  if (kind === "web_app" && typeof button.webAppUrl === "string" && button.webAppUrl.trim()) {
    return { id, text, kind: "web_app" as const, webAppUrl: button.webAppUrl.trim() };
  }

  if (kind === "copy_text" && typeof button.copyText === "string" && button.copyText.trim()) {
    return {
      id,
      text,
      kind: "copy_text" as const,
      copyText: stripTextEmojis(button.copyText.trim()),
    };
  }

  if (kind === "switch_inline" && typeof button.switchInlineQuery === "string") {
    return {
      id,
      text,
      kind: "switch_inline" as const,
      switchInlineQuery: button.switchInlineQuery,
    };
  }

  return { id, text, kind: "callback" as const };
}

function parseGeneratedReplyButton(raw: unknown) {
  if (typeof raw === "string" && raw.trim()) {
    return {
      id: createMessageButtonId(),
      text: clampButtonText(stripTextEmojis(raw.trim())),
      kind: "text" as const,
    };
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const button = raw as Record<string, unknown>;
  if (typeof button.text !== "string" || !button.text.trim()) {
    return null;
  }

  const id = createMessageButtonId();
  const text = clampButtonText(stripTextEmojis(button.text.trim()));

  if (button.kind === "request_contact") {
    return { id, text, kind: "request_contact" as const };
  }

  if (button.kind === "request_location") {
    return { id, text, kind: "request_location" as const };
  }

  return { id, text, kind: "text" as const };
}

function parseGeneratedConditionRules(raw: unknown): ConditionRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const rule = item as Record<string, unknown>;
      const id = typeof rule.id === "string" && rule.id ? rule.id : createConditionRuleId();

      if (rule.type === "chat_member") {
        const chatIds = Array.isArray(rule.chatIds)
          ? rule.chatIds
              .filter(
                (value): value is string => typeof value === "string" && value.trim().length > 0,
              )
              .map((value) => value.trim())
          : typeof rule.chatId === "string" && rule.chatId.trim()
            ? [rule.chatId.trim()]
            : [];

        if (chatIds.length === 0) {
          return null;
        }

        return {
          id,
          type: "chat_member" as const,
          chatIds,
          chatMatchMode: rule.chatMatchMode === "any" ? "any" : "all",
        };
      }

      if (rule.type === "is_premium") {
        return {
          id,
          type: "is_premium" as const,
          expected: rule.expected !== false,
        };
      }

      if (rule.type === "has_username") {
        return {
          id,
          type: "has_username" as const,
          expected: rule.expected !== false,
        };
      }

      if (rule.type === "start_param") {
        const value = typeof rule.value === "string" ? rule.value.trim() : "";
        if (!value) {
          return null;
        }

        return {
          id,
          type: "start_param" as const,
          operator: rule.operator === "contains" ? "contains" : "equals",
          value,
        };
      }

      return null;
    })
    .filter((rule): rule is ConditionRule => rule !== null);
}

function parseMessageSendOptions(node: Record<string, unknown>) {
  const delaySeconds =
    typeof node.delaySeconds === "number" && node.delaySeconds > 0
      ? Math.floor(node.delaySeconds)
      : undefined;

  const attachmentsMode =
    node.attachmentsMode === "album" ||
    node.attachmentsMode === "documents" ||
    node.attachmentsMode === "video_note" ||
    node.attachmentsMode === "audio"
      ? node.attachmentsMode
      : undefined;

  return {
    ...(typeof node.linkPreview === "boolean" ? { linkPreview: node.linkPreview } : {}),
    ...(attachmentsMode ? { attachmentsMode } : {}),
    ...(node.showCaptionAboveMedia === true ? { showCaptionAboveMedia: true } : {}),
    ...(node.showTyping === true ? { showTyping: true } : {}),
    ...(node.silent === true ? { silent: true } : {}),
    ...(node.protectContent === true ? { protectContent: true } : {}),
    ...(node.replyToUser === true ? { replyToUser: true } : {}),
    ...(delaySeconds != null ? { delaySeconds } : {}),
  };
}

function isFlowNodeType(value: unknown): value is FlowNodeType {
  return typeof value === "string" && FLOW_NODE_TYPES.includes(value as FlowNodeType);
}

function normalizeNodeSpec(raw: unknown): GeneratedFlowNodeSpec | null {
  const base = normalizeNodeSpecBase(raw);
  if (!base) {
    return null;
  }

  const node = raw as Partial<GeneratedFlowNodeSpec>;
  const id = typeof node.id === "string" && node.id.trim() ? node.id.trim() : undefined;
  const branch =
    node.branch === "yes" ||
    node.branch === "no" ||
    node.branch === "success" ||
    node.branch === "error"
      ? node.branch
      : undefined;

  return {
    ...base,
    ...(id ? { id } : {}),
    ...(branch ? { branch } : {}),
  };
}

function normalizeNodeSpecBase(raw: unknown): GeneratedFlowNodeSpec | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const node = raw as Partial<GeneratedFlowNodeSpec>;
  if (!isFlowNodeType(node.type) || typeof node.label !== "string" || !node.label.trim()) {
    return null;
  }

  const defaults = createDefaultNodeData(node.type);
  const label = stripTextEmojis(node.label.trim());

  switch (node.type) {
    case "trigger": {
      const triggerType =
        node.triggerType === "any_message" ||
        node.triggerType === "inactivity" ||
        node.triggerType === "payment_succeeded" ||
        node.triggerType === "command"
          ? node.triggerType
          : (defaults as { triggerType: TriggerNodeData["triggerType"] }).triggerType;

      return {
        type: "trigger",
        label,
        command:
          typeof node.command === "string" && node.command.trim()
            ? node.command.trim()
            : (defaults as { command: string }).command,
        triggerType,
        ...(triggerType === "inactivity"
          ? { inactivityHours: normalizeInactivityHours(node.inactivityHours) }
          : {}),
      };
    }
    case "message": {
      const rawNode = node as Record<string, unknown>;
      const text =
        typeof node.text === "string" && node.text.trim()
          ? stripTextEmojis(node.text.trim())
          : ((defaults as { text?: string }).text ?? "");

      const parseMode =
        node.parseMode === "HTML" || node.parseMode === "MarkdownV2" ? node.parseMode : "HTML";

      const keyboard = parseGeneratedKeyboard(node.keyboard);

      return {
        type: "message",
        ...normalizeMessageNodeData({
          label,
          text,
          parseMode,
          ...(keyboard ? { keyboard } : {}),
          ...parseMessageSendOptions(rawNode),
        }),
      };
    }
    case "condition": {
      const rawNode = node as Record<string, unknown>;
      return {
        type: "condition",
        ...normalizeConditionNodeData({
          label,
          matchMode: node.matchMode,
          rules: parseGeneratedConditionRules(rawNode.rules),
        }),
      };
    }
    case "set_variable": {
      const rawNode = node as Record<string, unknown>;
      return {
        type: "set_variable",
        ...normalizeSetVariableNodeData({
          label,
          variableKey: rawNode.variableKey,
          valueSource: rawNode.valueSource,
          value: rawNode.value,
        }),
      };
    }
    case "wait_input": {
      const rawNode = node as Record<string, unknown>;
      return {
        type: "wait_input",
        ...normalizeWaitInputNodeData({
          label,
          variableKey: rawNode.variableKey,
        }),
      };
    }
    case "http_request": {
      const rawNode = node as Record<string, unknown>;
      return {
        type: "http_request",
        ...normalizeHttpRequestNodeData({
          label,
          method: rawNode.method,
          url: rawNode.url,
          headers: rawNode.headers,
          body: rawNode.body,
          responseVariable: rawNode.responseVariable,
          responseStatusVariable: rawNode.responseStatusVariable,
          timeoutMs: rawNode.timeoutMs,
          extractions: rawNode.extractions,
        }),
      };
    }
    case "ai_reply":
      return {
        type: "ai_reply",
        label,
        systemPrompt:
          typeof node.systemPrompt === "string" && node.systemPrompt.trim()
            ? stripTextEmojis(node.systemPrompt.trim())
            : (defaults as { systemPrompt: string }).systemPrompt,
      };
    case "admin_notify": {
      const rawNode = node as Record<string, unknown>;
      const normalized = normalizeAdminNotifyNodeData({
        label,
        chatId: rawNode.chatId,
        text: typeof node.text === "string" ? stripTextEmojis(node.text) : rawNode.text,
      });
      return { type: "admin_notify", ...normalized };
    }
    case "json_extract": {
      const rawNode = node as Record<string, unknown>;
      const normalized = normalizeJsonExtractNodeData({
        label,
        sourceVariable: rawNode.sourceVariable,
        path: rawNode.path,
        targetVariable: rawNode.targetVariable,
      });
      return { type: "json_extract", ...normalized };
    }
    case "save_record": {
      const rawNode = node as Record<string, unknown>;
      const normalized = normalizeSaveRecordNodeData({
        label,
        collection: rawNode.collection,
        fields: rawNode.fields,
      });
      return { type: "save_record", ...normalized };
    }
    case "choice":
      return {
        type: "choice",
        label,
        prompt: typeof node.prompt === "string" ? stripTextEmojis(node.prompt.trim()) : "",
        variableKey:
          typeof node.variableKey === "string" && node.variableKey.trim()
            ? node.variableKey.trim()
            : "choice",
        options: Array.isArray(node.options) ? node.options : [],
        ...(node.parseMode ? { parseMode: node.parseMode } : {}),
      };
    case "jump":
      return {
        type: "jump",
        label,
        targetNodeId: typeof node.targetNodeId === "string" ? node.targetNodeId.trim() : "",
      };
    case "form":
      return {
        type: "form",
        label,
        questions: (Array.isArray(node.questions) ? node.questions : []).map((q) => ({
          prompt: q.prompt ?? "",
          variableKey: q.variableKey ?? "field",
          type: (q.type as "text" | "phone" | "email" | "contact") ?? "text",
        })),
      };
  }
}

function ensureMinimumNodes(nodes: GeneratedFlowNodeSpec[]): GeneratedFlowNodeSpec[] {
  const result = [...nodes];

  if (!result.some((node) => node.type === "trigger")) {
    result.unshift({
      type: "trigger",
      label: "Старт",
      command: "/start",
      triggerType: "command",
    });
  }

  if (!result.some((node) => node.type === "ai_reply")) {
    result.push({
      type: "ai_reply",
      label: "AI-ответ",
      systemPrompt: "Отвечай на вопросы пользователя.",
    });
  }

  return result;
}

function parseGeneratedSecrets(raw: unknown): FlowSecretDeclaration[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const secret = item as Partial<FlowSecretDeclaration>;
      const key = typeof secret.key === "string" ? secret.key.trim() : "";
      if (!key) {
        return null;
      }

      return {
        key,
        ...(typeof secret.label === "string" && secret.label.trim()
          ? { label: stripTextEmojis(secret.label.trim()) }
          : {}),
        ...(typeof secret.description === "string" && secret.description.trim()
          ? { description: stripTextEmojis(secret.description.trim()) }
          : {}),
      };
    })
    .filter((item): item is FlowSecretDeclaration => item !== null);
}

function parseGeneratedVariables(raw: unknown): FlowVariableDeclaration[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const variable = item as Partial<FlowVariableDeclaration>;
      const key = normalizeVariableKey(typeof variable.key === "string" ? variable.key : "");
      if (!isValidVariableKey(key)) {
        return null;
      }

      return {
        key,
        ...(typeof variable.label === "string" && variable.label.trim()
          ? { label: variable.label.trim() }
          : {}),
        ...(typeof variable.defaultValue === "string"
          ? { defaultValue: variable.defaultValue }
          : {}),
      };
    })
    .filter((item): item is FlowVariableDeclaration => item !== null);
}

export function parsePartialGeneratedFlowFromStream(raw: string): GeneratedFlowSpec | null {
  const nodeObjects = extractCompleteJsonObjectsFromArray(raw, "nodes");
  const nodes = nodeObjects
    .map(normalizeNodeSpec)
    .filter((node): node is GeneratedFlowNodeSpec => node !== null);

  if (nodes.length === 0) {
    return null;
  }

  const nameMatch = raw.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const name =
    nameMatch?.[1] !== undefined
      ? stripTextEmojisOptional(unescapeJsonStringFragment(nameMatch[1]))
      : undefined;

  const secretObjects = extractCompleteJsonObjectsFromArray(raw, "secrets");
  const variableObjects = extractCompleteJsonObjectsFromArray(raw, "variables");

  return {
    ...(name ? { name } : {}),
    nodes,
    ...(secretObjects.length ? { secrets: parseGeneratedSecrets(secretObjects) } : {}),
    ...(variableObjects.length ? { variables: parseGeneratedVariables(variableObjects) } : {}),
  };
}

export function parseGeneratedFlowSpec(raw: string): GeneratedFlowSpec {
  const parsed = JSON.parse(extractJsonFromAiResponse(raw)) as Partial<GeneratedFlowSpec>;
  const nodes = Array.isArray(parsed.nodes)
    ? parsed.nodes
        .map(normalizeNodeSpec)
        .filter((node): node is GeneratedFlowNodeSpec => node !== null)
    : [];

  if (nodes.length === 0) {
    throw new Error("AI не вернул узлы сценария");
  }

  return {
    name: typeof parsed.name === "string" ? stripTextEmojisOptional(parsed.name.trim()) : undefined,
    assistantMessage:
      typeof parsed.assistantMessage === "string"
        ? stripTextEmojisOptional(parsed.assistantMessage.trim())
        : undefined,
    secrets: parseGeneratedSecrets(parsed.secrets),
    variables: parseGeneratedVariables(parsed.variables),
    nodes: ensureMinimumNodes(nodes),
  };
}

export function buildFlowDocument(
  spec: GeneratedFlowSpec,
  options?: { stableNodeIds?: string[]; skipMinimumNodes?: boolean },
): BotFlowDocument {
  const nodeSpecs = options?.skipMinimumNodes ? spec.nodes : ensureMinimumNodes(spec.nodes);
  const usedIds = new Set<string>();
  const branchByNodeId: BranchByNodeId = new Map();
  const nodes = nodeSpecs.map((nodeSpec, index) => {
    // Приоритет: персистентный id из спеки (для refine/агента) → стабильный id стрима → новый.
    const candidateId =
      nodeSpec.id?.trim() || options?.stableNodeIds?.[index] || createFlowNodeId(nodeSpec.type);
    let id = candidateId;
    while (usedIds.has(id)) {
      id = createFlowNodeId(nodeSpec.type);
    }
    usedIds.add(id);
    if (nodeSpec.branch) {
      branchByNodeId.set(id, nodeSpec.branch);
    }

    switch (nodeSpec.type) {
      case "trigger": {
        const triggerType = nodeSpec.triggerType ?? "command";
        return {
          id,
          type: "trigger" as const,
          position: buildGeneratedNodePosition(index),
          data: {
            label: nodeSpec.label,
            command: nodeSpec.command ?? "/start",
            triggerType,
            ...(triggerType === "inactivity"
              ? { inactivityHours: normalizeInactivityHours(nodeSpec.inactivityHours) }
              : {}),
          },
        };
      }
      case "message":
        return {
          id,
          type: "message" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeMessageNodeData({
            label: nodeSpec.label,
            text: nodeSpec.text,
            parseMode: nodeSpec.parseMode,
            linkPreview: nodeSpec.linkPreview,
            keyboard: parseGeneratedKeyboard(nodeSpec.keyboard),
            attachmentsMode: nodeSpec.attachmentsMode,
            showCaptionAboveMedia: nodeSpec.showCaptionAboveMedia,
            showTyping: nodeSpec.showTyping,
            silent: nodeSpec.silent,
            protectContent: nodeSpec.protectContent,
            replyToUser: nodeSpec.replyToUser,
            delaySeconds: nodeSpec.delaySeconds,
          }),
        };
      case "condition":
        return {
          id,
          type: "condition" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeConditionNodeData({
            label: nodeSpec.label,
            matchMode: nodeSpec.matchMode,
            rules: nodeSpec.rules,
          }),
        };
      case "set_variable":
        return {
          id,
          type: "set_variable" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeSetVariableNodeData({
            label: nodeSpec.label,
            variableKey: nodeSpec.variableKey,
            valueSource: nodeSpec.valueSource,
            value: nodeSpec.value,
          }),
        };
      case "wait_input":
        return {
          id,
          type: "wait_input" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeWaitInputNodeData({
            label: nodeSpec.label,
            variableKey: nodeSpec.variableKey,
          }),
        };
      case "http_request":
        return {
          id,
          type: "http_request" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeHttpRequestNodeData({
            label: nodeSpec.label,
            method: nodeSpec.method,
            url: nodeSpec.url,
            headers: nodeSpec.headers,
            body: nodeSpec.body,
            responseVariable: nodeSpec.responseVariable,
            responseStatusVariable: nodeSpec.responseStatusVariable,
            timeoutMs: nodeSpec.timeoutMs,
            extractions: nodeSpec.extractions,
          }),
        };
      case "ai_reply":
        return {
          id,
          type: "ai_reply" as const,
          position: buildGeneratedNodePosition(index),
          data: {
            label: nodeSpec.label,
            systemPrompt: nodeSpec.systemPrompt ?? "Отвечай на вопросы пользователя.",
          },
        };
      case "admin_notify":
        return {
          id,
          type: "admin_notify" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeAdminNotifyNodeData({
            label: nodeSpec.label,
            chatId: nodeSpec.chatId,
            text: nodeSpec.text,
          }),
        };
      case "json_extract":
        return {
          id,
          type: "json_extract" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeJsonExtractNodeData({
            label: nodeSpec.label,
            sourceVariable: nodeSpec.sourceVariable,
            path: nodeSpec.path,
            targetVariable: nodeSpec.targetVariable,
          }),
        };
      case "save_record":
        return {
          id,
          type: "save_record" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeSaveRecordNodeData({
            label: nodeSpec.label,
            collection: nodeSpec.collection,
            fields: nodeSpec.fields,
          }),
        };
      case "choice":
        return {
          id,
          type: "choice" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeChoiceNodeData({
            label: nodeSpec.label,
            prompt: nodeSpec.prompt ?? "",
            variableKey: nodeSpec.variableKey ?? "choice",
            options: Array.isArray(nodeSpec.options) ? nodeSpec.options : [],
            parseMode: nodeSpec.parseMode,
          }),
        };
      case "jump":
        return {
          id,
          type: "jump" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeJumpNodeData({
            label: nodeSpec.label,
            targetNodeId: nodeSpec.targetNodeId ?? "",
          }),
        };
      case "form":
        return {
          id,
          type: "form" as const,
          position: buildGeneratedNodePosition(index),
          data: normalizeFormNodeData({
            label: nodeSpec.label,
            questions: (Array.isArray(nodeSpec.questions) ? nodeSpec.questions : []).map((q) => ({
              prompt: q.prompt ?? "",
              variableKey: q.variableKey ?? "field",
              type: (q.type as "text" | "phone" | "email" | "contact") ?? "text",
            })),
          }),
        };
      default: {
        const exhaustive: never = nodeSpec.type;
        throw new Error(`Неизвестный тип узла: ${exhaustive}`);
      }
    }
  });

  const lanes = splitIntoTriggerLanes(nodes);
  const edges = repairMessageButtonEdges(
    nodes,
    lanes.flatMap((lane) => buildGeneratedEdges(lane, branchByNodeId)),
  );
  const positions = buildDagreNodePositions(nodes, edges);
  const positionedNodes = nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));

  return sanitizeFlowDocument({
    nodes: positionedNodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    ...(spec.secrets?.length ? { secrets: spec.secrets } : {}),
    ...(spec.variables?.length ? { variables: spec.variables } : {}),
  });
}
