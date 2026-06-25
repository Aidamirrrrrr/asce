import { FLOW_BUS_EDGE_TYPE } from "@/lib/flow/branch-handle-utils";
import { isValidSourceHandle } from "@/lib/flow/condition-node-utils";
import {
  buttonLabelMatches,
  getBranchableMessageHandles,
  normalizeBranchLabel,
} from "@/lib/flow/flow-button-wiring";
import {
  type BotFlowDocument,
  createDefaultNodeData,
  createFlowNodeId,
  FLOW_NODE_TYPES,
  type FlowEdge,
  type FlowNode,
  type FlowNodeData,
  type FlowNodeType,
  migrateFlowDocument,
  pruneInvalidEdges,
} from "@/lib/flow/flow-schema";
import { getMessageSourceHandles, normalizeMessageNodeData } from "@/lib/flow/message-node-utils";

/**
 * Чистые тулзы над BotFlowDocument для агентного редактирования схемы.
 *
 * Все операции иммутабельны: возвращают НОВЫЙ документ, не мутируя исходный.
 * Нормализация и валидация делегируются существующим примитивам
 * (migrateFlowDocument / pruneInvalidEdges / isValidSourceHandle), чтобы
 * не дублировать правила схемы.
 */

export type FlowToolOk<TData = undefined> = {
  ok: true;
  doc: BotFlowDocument;
  summary: string;
  data?: TData;
};

export type FlowToolError = {
  ok: false;
  error: string;
};

export type FlowToolResult<TData = undefined> = FlowToolOk<TData> | FlowToolError;

export type NodeBranch = "next" | "yes" | "no" | "success" | "error";

export type NodeDigest = {
  id: string;
  type: FlowNodeType;
  label: string;
  summary: string;
};

export type EdgeDigest = {
  source: string;
  target: string;
  branch: NodeBranch | string;
};

function isFlowNodeType(value: unknown): value is FlowNodeType {
  return typeof value === "string" && FLOW_NODE_TYPES.includes(value as FlowNodeType);
}

function getNodeLabel(node: FlowNode): string {
  const data = node.data as { label?: unknown } | undefined;
  if (data && typeof data.label === "string" && data.label.trim()) {
    return data.label.trim();
  }
  return node.id;
}

/** Короткое человекочитаемое описание узла по его данным. */
function summarizeNode(node: FlowNode): string {
  const data = node.data as Record<string, unknown>;
  const str = (key: string): string =>
    typeof data[key] === "string" ? (data[key] as string).trim() : "";

  switch (node.type) {
    case "trigger": {
      const command = str("command");
      const triggerType = str("triggerType") || "command";
      return command ? `${triggerType} ${command}` : triggerType;
    }
    case "message": {
      const text = str("text");
      return text ? text.slice(0, 80) : "(без текста)";
    }
    case "condition": {
      const rules = Array.isArray(data.rules) ? data.rules.length : 0;
      return `правил: ${rules}`;
    }
    case "set_variable":
      return `var.${str("variableKey")} = ${str("valueSource")}`;
    case "wait_input":
      return `-> var.${str("variableKey")}`;
    case "http_request":
      return `${str("method")} ${str("url").slice(0, 60)}`;
    case "ai_reply":
      return str("systemPrompt").slice(0, 80) || "(без инструкции)";
    case "admin_notify":
      return `${str("chatId")}: ${str("text").slice(0, 60)}`;
    case "json_extract":
      return `var.${str("sourceVariable")}.${str("path")} -> var.${str("targetVariable")}`;
    case "save_record": {
      const fields = Array.isArray(data.fields) ? data.fields.length : 0;
      return `${str("collection")}: полей ${fields}`;
    }
    default:
      return "";
  }
}

export function describeNode(node: FlowNode): NodeDigest {
  return {
    id: node.id,
    type: node.type as FlowNodeType,
    label: getNodeLabel(node),
    summary: summarizeNode(node),
  };
}

/** Прогнать одиночный узел через общий нормализатор схемы. */
function normalizeSingleNode(node: FlowNode): FlowNode {
  const migrated = migrateFlowDocument({ nodes: [node], edges: [] });
  return migrated.nodes[0] ?? node;
}

/** Финальная зачистка: убрать рёбра с невалидными хендлами и дубли id рёбер. */
function finalizeDoc(doc: BotFlowDocument): BotFlowDocument {
  const seenEdgeIds = new Set<string>();
  const uniqueEdges = pruneInvalidEdges(doc.nodes, doc.edges).filter((edge) => {
    if (seenEdgeIds.has(edge.id)) {
      return false;
    }
    seenEdgeIds.add(edge.id);
    return true;
  });
  return { ...doc, edges: uniqueEdges };
}

function defaultPrimaryHandle(node: FlowNode): NodeBranch {
  if (node.type === "condition") {
    return "yes";
  }
  if (node.type === "http_request") {
    return "success";
  }
  return "next";
}

function validHandlesFor(node: FlowNode): string {
  switch (node.type) {
    case "condition":
      return "yes, no";
    case "http_request":
      return "success, error";
    default:
      return "next";
  }
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

export function listNodes(doc: BotFlowDocument): FlowToolOk<{
  nodes: NodeDigest[];
  edges: EdgeDigest[];
}> {
  const nodes = doc.nodes.map(describeNode);
  const edges: EdgeDigest[] = doc.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    branch: edge.sourceHandle ?? "next",
  }));

  return {
    ok: true,
    doc,
    summary: `Узлов: ${nodes.length}, связей: ${edges.length}`,
    data: { nodes, edges },
  };
}

export function findNodes(
  doc: BotFlowDocument,
  query: string,
): FlowToolOk<{ matches: NodeDigest[] }> {
  const needle = query.trim().toLowerCase();

  const matches = doc.nodes
    .filter((node) => {
      if (!needle) {
        return true;
      }
      const digest = describeNode(node);
      const haystack =
        `${digest.id} ${digest.type} ${digest.label} ${digest.summary}`.toLowerCase();
      return haystack.includes(needle);
    })
    .map(describeNode);

  return {
    ok: true,
    doc,
    summary: matches.length > 0 ? `Найдено узлов: ${matches.length}` : "Ничего не найдено",
    data: { matches },
  };
}

// ---------------------------------------------------------------------------
// Write tools
// ---------------------------------------------------------------------------

export type AddNodeArgs = {
  type: string;
  data?: Record<string, unknown>;
  /** Узел, после которого подключить новый (создаст ребро). */
  afterNodeId?: string;
  /** Ветка для ребра от afterNodeId (по умолчанию основная: yes/success/next). */
  branch?: NodeBranch;
};

export function addNode(
  doc: BotFlowDocument,
  args: AddNodeArgs,
): FlowToolResult<{ nodeId: string }> {
  if (!isFlowNodeType(args.type)) {
    return {
      ok: false,
      error: `Неизвестный тип узла "${args.type}". Допустимо: ${FLOW_NODE_TYPES.join(", ")}`,
    };
  }

  const mergedData = {
    ...createDefaultNodeData(args.type),
    ...(args.data ?? {}),
  } as FlowNodeData;

  const newNode = normalizeSingleNode({
    id: createFlowNodeId(args.type),
    type: args.type,
    position: { x: 0, y: 0 },
    data: mergedData,
  });

  let nextDoc: BotFlowDocument = {
    ...doc,
    nodes: [...doc.nodes, newNode],
  };

  if (args.afterNodeId) {
    const connectResult = connectNodes(nextDoc, {
      source: args.afterNodeId,
      target: newNode.id,
      branch: args.branch,
    });
    if (!connectResult.ok) {
      return connectResult;
    }
    nextDoc = connectResult.doc;
  }

  return {
    ok: true,
    doc: finalizeDoc(nextDoc),
    summary: `Добавлен узел ${args.type} (${newNode.id})${
      args.afterNodeId ? ` после ${args.afterNodeId}` : ""
    }`,
    data: { nodeId: newNode.id },
  };
}

export function deleteNode(doc: BotFlowDocument, nodeId: string): FlowToolResult {
  const target = doc.nodes.find((node) => node.id === nodeId);
  if (!target) {
    const hint =
      doc.nodes.length > 0 ? ` Существующие id: ${doc.nodes.map((n) => n.id).join(", ")}` : "";
    return { ok: false, error: `Узел "${nodeId}" не найден.${hint}` };
  }

  const nodes = doc.nodes.filter((node) => node.id !== nodeId);
  const removedEdges = doc.edges.filter(
    (edge) => edge.source === nodeId || edge.target === nodeId,
  ).length;
  const edges = doc.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);

  return {
    ok: true,
    doc: finalizeDoc({ ...doc, nodes, edges }),
    summary: `Удалён узел ${nodeId} (${target.type}) и связей: ${removedEdges}`,
  };
}

export function updateNode(
  doc: BotFlowDocument,
  nodeId: string,
  dataPatch: Record<string, unknown>,
): FlowToolResult {
  const current = doc.nodes.find((node) => node.id === nodeId);
  if (!current) {
    const hint =
      doc.nodes.length > 0 ? ` Существующие id: ${doc.nodes.map((n) => n.id).join(", ")}` : "";
    return { ok: false, error: `Узел "${nodeId}" не найден.${hint}` };
  }

  const mergedData = {
    ...(current.data as Record<string, unknown>),
    ...dataPatch,
  } as FlowNodeData;

  const updated = normalizeSingleNode({ ...current, data: mergedData });
  const nodes = doc.nodes.map((node) => (node.id === nodeId ? updated : node));

  const changedKeys = Object.keys(dataPatch).join(", ") || "(нет полей)";
  return {
    ok: true,
    doc: finalizeDoc({ ...doc, nodes }),
    summary: `Обновлён узел ${nodeId}: ${changedKeys}`,
  };
}

export type ConnectArgs = {
  source: string;
  target: string;
  /** Ветка-источник; по умолчанию основная для типа узла. */
  branch?: NodeBranch;
  /** Текст callback-кнопки сообщения-источника (для веток по кнопкам). */
  buttonText?: string;
};

/** Найти хендл callback-кнопки сообщения по её тексту. */
function resolveButtonHandle(
  sourceNode: FlowNode,
  buttonText: string,
): { ok: true; handle: string } | { ok: false; error: string } {
  if (sourceNode.type !== "message") {
    return {
      ok: false,
      error: `buttonText допустим только для узлов message, а узел ${sourceNode.id} — ${sourceNode.type}`,
    };
  }

  const buttonHandles = getMessageSourceHandles(normalizeMessageNodeData(sourceNode.data)).filter(
    (handle) => handle.id !== "next",
  );

  if (buttonHandles.length === 0) {
    return {
      ok: false,
      error: `У сообщения ${sourceNode.id} нет callback-кнопок. Сначала добавь клавиатуру через update_node (keyboard.buttons).`,
    };
  }

  const exact = buttonHandles.find(
    (handle) => normalizeBranchLabel(handle.label) === normalizeBranchLabel(buttonText),
  );
  const match =
    exact ?? buttonHandles.find((handle) => buttonLabelMatches(buttonText, handle.label));

  if (!match) {
    const available = buttonHandles.map((handle) => `"${handle.label}"`).join(", ");
    return {
      ok: false,
      error: `Кнопка "${buttonText}" не найдена у сообщения ${sourceNode.id}. Доступные кнопки: ${available}`,
    };
  }

  return { ok: true, handle: match.id };
}

export function connectNodes(doc: BotFlowDocument, args: ConnectArgs): FlowToolResult {
  const nodeIdHint = () =>
    doc.nodes.length > 0
      ? ` Существующие id: ${doc.nodes.map((n) => n.id).join(", ")}`
      : " Узлов нет.";

  const sourceNode = doc.nodes.find((node) => node.id === args.source);
  if (!sourceNode) {
    return { ok: false, error: `Узел-источник "${args.source}" не найден.${nodeIdHint()}` };
  }

  const targetNode = doc.nodes.find((node) => node.id === args.target);
  if (!targetNode) {
    return { ok: false, error: `Узел-цель "${args.target}" не найден.${nodeIdHint()}` };
  }

  if (args.source === args.target) {
    return { ok: false, error: "Нельзя соединить узел сам с собой" };
  }

  let handle: string;
  if (args.buttonText?.trim()) {
    const resolved = resolveButtonHandle(sourceNode, args.buttonText.trim());
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
    handle = resolved.handle;
  } else {
    handle = args.branch ?? defaultPrimaryHandle(sourceNode);
  }

  if (!isValidSourceHandle(sourceNode, handle)) {
    const branchButtons = getBranchableMessageHandles(sourceNode);
    if (branchButtons.length > 0 && handle === "next") {
      const available = branchButtons.map((button) => `"${button.label}"`).join(", ");
      return {
        ok: false,
        error:
          `У сообщения с кнопками нельзя связать ветку "next". ` +
          `Используй connect_nodes с buttonText. Доступные кнопки: ${available}`,
      };
    }

    return {
      ok: false,
      error: `Ветка "${handle}" недопустима для узла типа ${sourceNode.type}. Доступно: ${validHandlesFor(
        sourceNode,
      )}`,
    };
  }

  // Дедуп: на одну ветку-источник — одно исходящее ребро.
  const filteredEdges = doc.edges.filter(
    (edge) => !(edge.source === args.source && (edge.sourceHandle ?? "next") === handle),
  );

  const newEdge: FlowEdge = {
    id: `e-${args.source}-${handle}-${args.target}`,
    source: args.source,
    target: args.target,
    sourceHandle: handle,
    type: FLOW_BUS_EDGE_TYPE,
  };

  return {
    ok: true,
    doc: finalizeDoc({ ...doc, edges: [...filteredEdges, newEdge] }),
    summary: `Связь ${args.source} --${handle}--> ${args.target}`,
  };
}

export type SetBranchArgs = {
  source: string;
  target: string;
  branch: NodeBranch;
};

export function setBranch(doc: BotFlowDocument, args: SetBranchArgs): FlowToolResult {
  return connectNodes(doc, { source: args.source, target: args.target, branch: args.branch });
}

// ---------------------------------------------------------------------------
// Dispatcher (для агентного цикла tool-calling)
// ---------------------------------------------------------------------------

export const FLOW_TOOL_NAMES = [
  "list_nodes",
  "find_nodes",
  "add_node",
  "delete_node",
  "update_node",
  "connect_nodes",
  "set_branch",
] as const;

export type FlowToolName = (typeof FLOW_TOOL_NAMES)[number];

export function applyFlowTool(
  doc: BotFlowDocument,
  name: string,
  args: Record<string, unknown>,
): FlowToolResult<unknown> {
  switch (name) {
    case "list_nodes":
      return listNodes(doc);
    case "find_nodes":
      return findNodes(doc, typeof args.query === "string" ? args.query : "");
    case "add_node":
      return addNode(doc, {
        type: String(args.type ?? ""),
        data: isRecordLike(args.data) ? args.data : undefined,
        afterNodeId: typeof args.afterNodeId === "string" ? args.afterNodeId : undefined,
        branch: isBranch(args.branch) ? args.branch : undefined,
      });
    case "delete_node":
      return deleteNode(doc, String(args.nodeId ?? ""));
    case "update_node":
      return updateNode(doc, String(args.nodeId ?? ""), isRecordLike(args.data) ? args.data : {});
    case "connect_nodes":
      return connectNodes(doc, {
        source: String(args.source ?? ""),
        target: String(args.target ?? ""),
        branch: isBranch(args.branch) ? args.branch : undefined,
        buttonText: typeof args.buttonText === "string" ? args.buttonText : undefined,
      });
    case "set_branch":
      return setBranch(doc, {
        source: String(args.source ?? ""),
        target: String(args.target ?? ""),
        branch: isBranch(args.branch) ? args.branch : "next",
      });
    default:
      return { ok: false, error: `Неизвестный инструмент "${name}"` };
  }
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBranch(value: unknown): value is NodeBranch {
  return (
    value === "next" ||
    value === "yes" ||
    value === "no" ||
    value === "success" ||
    value === "error"
  );
}
