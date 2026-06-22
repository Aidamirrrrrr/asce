/**
 * JSON-based flow generation.
 * Two functions:
 *   jsonCreateFlow  — one LLM call → complete GeneratedFlowSpec → BotFlowDocument
 *   jsonRefineFlow  — one LLM call → delta JSON → apply atomically → BotFlowDocument
 */
import { generateAiReply } from "@/lib/ai/ai-client";
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
import { extractJsonFromAiResponse } from "@/lib/ai/stream-json-utils";
import { connectNodes, deleteNode, updateNode } from "@/lib/flow/flow-tools";
import {
  type BotFlowDocument,
  createFlowNodeId,
  sanitizeFlowDocument,
} from "@/lib/flow/flow-schema";
import {
  applyLayoutToFlowDocument,
  buildFlowDocument,
  type GeneratedFlowNodeSpec,
  parseGeneratedFlowSpec,
} from "@/lib/flow/normalize-generated-flow";
import { describeNode } from "@/lib/flow/flow-tools";
import { getMessageSourceHandles, normalizeMessageNodeData } from "@/lib/flow/message-node-utils";
import type { ProjectChatMessage } from "@/lib/projects";
import { stripTextEmojisOptional } from "@/lib/text/strip-emojis";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const EDGES_RULES = `ПРАВИЛА EDGES (читай внимательно — ошибки здесь ломают бота):

0. ПЕРВОЕ РЕБРО: первым в массиве edges ВСЕГДА должно быть { "source": "start", "target": "<первый_узел>" }.
   ✗ Забыть start → welcome — самая частая ошибка, которая делает весь бот недостижимым!

1. КНОПКИ: каждая callback-кнопка message → edge с "buttonText" равным ТОЧНОМУ тексту кнопки.
   Кнопка ведёт к БЛИЖАЙШЕМУ следующему шагу, НЕ к результату в глубине цепочки.
   ✓ { "source": "welcome", "target": "fetch_rates", "buttonText": "Показать курс" }  ← button → http_request
   ✗ { "source": "welcome", "target": "show_rates",  "buttonText": "Показать курс" }  ← пропустил http_request!

2. CONDITION ветки:
   "yes"  = условие ВЫПОЛНЕНО (пользователь подписан / подходит / прошёл проверку)
   "no"   = условие НЕ выполнено (не подписан / не подходит / не прошёл)
   ✓ { "source": "check_sub", "target": "content",        "branch": "yes" }  ← подписан → контент
   ✓ { "source": "check_sub", "target": "ask_to_sub",     "branch": "no"  }  ← не подписан → просим подписаться
   ✗ { "source": "check_sub", "target": "content",        "branch": "no"  }  ← НЕВЕРНО, перепутаны ветки!

3. HTTP_REQUEST ветки:
   "success" = запрос вернул 2xx
   "error"   = запрос упал или вернул ошибку
   Кнопка ведёт к http_request узлу, НЕ к success-ноде:
   ✓ { "source": "menu", "target": "fetch_data", "buttonText": "Получить данные" }
   ✓ { "source": "fetch_data", "target": "show_result", "branch": "success" }
   ✓ { "source": "fetch_data", "target": "error_msg",   "branch": "error"   }

4. МЕНЮ С РАЗДЕЛАМИ: каждая кнопка → своя нода раздела (НЕ общая нода).
   ✓ { "source": "menu", "target": "section_faq",      "buttonText": "FAQ"      }
   ✓ { "source": "menu", "target": "section_booking",  "buttonText": "Запись"   }
   ✓ { "source": "menu", "target": "section_contacts", "buttonText": "Контакты" }
   ✗ { "source": "menu", "target": "ai_reply",         "buttonText": "FAQ"      }  ← неверно!

5. Линейные узлы (message без кнопок, choice, form, wait_input, save_record, admin_notify, ai_reply) → edge без branch/buttonText.
6. jump — НЕ добавляй edge (использует targetNodeId внутри).
7. choice/form → один edge, target = следующий шаг после сбора данных.`;

const CREATE_SYSTEM_PROMPT = `Ты — генератор схем Telegram-ботов. Выдай ТОЛЬКО корректный JSON-объект — без пояснений, без markdown-блоков.

Формат ответа:
{
  "name": "Название бота (3-5 слов)",
  "assistantMessage": "Что построено: 1-2 предложения по-русски",
  "nodes": [
    { "id": "start", "type": "trigger", "label": "Старт", "command": "/start", "triggerType": "command" },
    ...
  ],
  "edges": [
    { "source": "start",      "target": "welcome"    },
    { "source": "welcome",    "target": "section_a",  "buttonText": "Раздел А" },
    { "source": "welcome",    "target": "section_b",  "buttonText": "Раздел Б" },
    { "source": "check_cond", "target": "ok_node",    "branch": "yes" },
    { "source": "check_cond", "target": "fail_node",  "branch": "no"  },
    { "source": "http_node",  "target": "result",     "branch": "success" },
    { "source": "http_node",  "target": "err_msg",    "branch": "error"   }
  ]
}

ID узлов: уникальный snake_case, латиница (start, main_menu, faq_delivery, booking_form).

${EDGES_RULES}

${NO_EMOJI_RULE}.

${NODE_TYPES_SECTION}

${KEYBOARD_SECTION}

${CONDITION_SECTION}

${LINEAR_NODES_SECTION}

${VARIABLES_AND_MESSAGE_SECTION}

${PAYMENTS_SECTION}

${TEMPLATES_SECTION}`;

// ---------------------------------------------------------------------------

const REFINE_SYSTEM_PROMPT = `Ты — редактор схем Telegram-ботов. Выдай ТОЛЬКО корректный JSON-объект — без пояснений, без markdown-блоков.

Формат ответа (delta):
{
  "assistantMessage": "Что изменено: 1-2 предложения по-русски",
  "addNodes": [
    { "id": "new_node_1", "type": "message", "label": "...", "text": "...", "keyboard": {...} }
  ],
  "updateNodes": [
    { "id": "existing-id", "label": "Новый лейбл", "text": "Новый текст", "keyboard": {...} }
  ],
  "deleteNodeIds": ["old-node-id"],
  "addEdges": [
    { "source": "menu_node", "target": "faq_node", "buttonText": "FAQ" },
    { "source": "cond_node", "target": "ok_node", "branch": "yes" },
    { "source": "http_node", "target": "err_node", "branch": "error" }
  ]
}

Правила изменений:
- Добавляй только то что реально меняется — не дублируй неизменённые узлы.
- Для существующих кнопок message: если добавляешь новый целевой узел — укажи edge с buttonText.
- deleteNodeIds удаляет узел И все его рёбра автоматически.
- ID новых узлов: уникальный snake_case, латиница.
${NO_EMOJI_RULE}.

${EDGES_RULES}

${NODE_TYPES_SECTION}

${KEYBOARD_SECTION}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExplicitEdge = {
  source: string;
  target: string;
  buttonText?: string;
  branch?: "yes" | "no" | "success" | "error";
};

type RefineDeltaEdge = ExplicitEdge;

type RefineDeltaUpdateNode = { id: string } & Partial<GeneratedFlowNodeSpec>;

type RefineDelta = {
  assistantMessage?: string;
  addNodes?: GeneratedFlowNodeSpec[];
  updateNodes?: RefineDeltaUpdateNode[];
  deleteNodeIds?: string[];
  addEdges?: RefineDeltaEdge[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Компактный дайджест схемы для промпта (id, тип, лейбл, кнопки, рёбра). */
export function buildFlowDigest(doc: BotFlowDocument): string {
  const labelById = new Map(doc.nodes.map((n) => [n.id, describeNode(n).label]));

  const nodeLines = doc.nodes.map((node) => {
    const d = describeNode(node);
    let extra = "";
    if (node.type === "message") {
      const btns = getMessageSourceHandles(normalizeMessageNodeData(node.data))
        .filter((h) => h.id !== "next")
        .map((h) => `«${h.label}»`);
      if (btns.length > 0) extra = ` | кнопки: ${btns.join(", ")}`;
    }
    const sum = d.summary ? ` — ${d.summary}` : "";
    return `- ${d.id} [${d.type}] ${d.label}${sum}${extra}`;
  });

  const edgeLines = doc.edges.map((e) => {
    const src = labelById.get(e.source) ?? e.source;
    const tgt = labelById.get(e.target) ?? e.target;
    return `- ${e.source} --${e.sourceHandle ?? "next"}--> ${e.target}  (${src} → ${tgt})`;
  });

  return `Узлы (${doc.nodes.length}):\n${nodeLines.join("\n") || "—"}\n\nРёбра (${doc.edges.length}):\n${edgeLines.join("\n") || "—"}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseExplicitEdges(raw: string): ExplicitEdge[] {
  try {
    const parsed = JSON.parse(extractJsonFromAiResponse(raw)) as Record<string, unknown>;
    if (!Array.isArray(parsed.edges)) return [];
    return (parsed.edges as ExplicitEdge[]).filter(
      (e) => e && typeof e.source === "string" && typeof e.target === "string",
    );
  } catch {
    return [];
  }
}

function applyExplicitEdges(doc: BotFlowDocument, edges: ExplicitEdge[]): BotFlowDocument {
  // Start from nodes-only (no heuristic edges)
  let current: BotFlowDocument = { ...doc, edges: [] };
  for (const edge of edges) {
    const result = connectNodes(current, {
      source: edge.source,
      target: edge.target,
      ...(edge.buttonText ? { buttonText: edge.buttonText } : {}),
      ...(edge.branch ? { branch: edge.branch } : {}),
    });
    if (result.ok) current = result.doc;
  }
  return current;
}

// Auto-heal: if a trigger has no outgoing edge, connect it to the first non-trigger node.
// Handles the common case where the LLM forgets the "start → welcome" edge.
function healOrphanedTriggers(doc: BotFlowDocument): BotFlowDocument {
  const hasOut = new Set(doc.edges.map((e) => e.source));
  const orphans = doc.nodes.filter((n) => n.type === "trigger" && !hasOut.has(n.id));
  if (orphans.length === 0) return doc;
  let current = doc;
  for (const trigger of orphans) {
    const firstTarget = current.nodes.find((n) => n.type !== "trigger");
    if (!firstTarget) continue;
    const result = connectNodes(current, { source: trigger.id, target: firstTarget.id });
    if (result.ok) current = result.doc;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function jsonCreateFlow(prompt: string): Promise<{
  flow: BotFlowDocument;
  name?: string;
  assistantMessage: string;
}> {
  const raw = await generateAiReply(CREATE_SYSTEM_PROMPT, prompt);

  const spec = parseGeneratedFlowSpec(raw);
  const explicitEdges = parseExplicitEdges(raw);

  // LLM owns all nodes; skipMinimumNodes avoids injecting a ghost ai_reply node
  let doc = buildFlowDocument(spec, { skipMinimumNodes: true });
  if (explicitEdges.length > 0) {
    doc = applyExplicitEdges(doc, explicitEdges);
  }
  doc = healOrphanedTriggers(doc);

  const flow = applyLayoutToFlowDocument(doc);

  return {
    flow,
    name: spec.name,
    assistantMessage: spec.assistantMessage ?? "Сценарий построен.",
  };
}

// ---------------------------------------------------------------------------
// Refine (delta)
// ---------------------------------------------------------------------------

function parseRefineDelta(raw: string): RefineDelta {
  const json = JSON.parse(extractJsonFromAiResponse(raw)) as Record<string, unknown>;

  const addNodes = Array.isArray(json.addNodes)
    ? (json.addNodes as GeneratedFlowNodeSpec[]).filter(
        (n) => n && typeof n === "object" && typeof n.type === "string",
      )
    : [];

  const updateNodes = Array.isArray(json.updateNodes)
    ? (json.updateNodes as RefineDeltaUpdateNode[]).filter(
        (n) => n && typeof n === "object" && typeof n.id === "string",
      )
    : [];

  const deleteNodeIds = Array.isArray(json.deleteNodeIds)
    ? (json.deleteNodeIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];

  const addEdges = Array.isArray(json.addEdges)
    ? (json.addEdges as RefineDeltaEdge[]).filter(
        (e) => e && typeof e.source === "string" && typeof e.target === "string",
      )
    : [];

  const assistantMessage =
    typeof json.assistantMessage === "string"
      ? stripTextEmojisOptional(json.assistantMessage.trim())
      : undefined;

  return { assistantMessage, addNodes, updateNodes, deleteNodeIds, addEdges };
}

function applyDeltaToDoc(doc: BotFlowDocument, delta: RefineDelta): BotFlowDocument {
  let current = doc;

  // 1. Delete
  for (const id of delta.deleteNodeIds ?? []) {
    const result = deleteNode(current, id);
    if (result.ok) current = result.doc;
  }

  // 2. Add new nodes via buildFlowDocument (handles all types + normalization)
  if ((delta.addNodes ?? []).length > 0) {
    const usedIds = new Set(current.nodes.map((n) => n.id));
    const miniSpec = {
      nodes: (delta.addNodes ?? []).map((spec) => {
        const candidateId = spec.id?.trim() || createFlowNodeId(spec.type);
        const id = usedIds.has(candidateId) ? createFlowNodeId(spec.type) : candidateId;
        usedIds.add(id);
        return { ...spec, id };
      }),
    };
    const built = buildFlowDocument(miniSpec, { skipMinimumNodes: true });
    // Merge: take new nodes (with their auto-edges from buildFlowDocument heuristic)
    // but deduplicate against existing — only keep inter-new edges for now;
    // explicit addEdges will handle connections to existing nodes.
    const newNodeIds = new Set(built.nodes.map((n) => n.id));
    const interNewEdges = built.edges.filter(
      (e) => newNodeIds.has(e.source) && newNodeIds.has(e.target),
    );
    current = sanitizeFlowDocument({
      ...current,
      nodes: [...current.nodes, ...built.nodes],
      edges: [...current.edges, ...interNewEdges],
    });
  }

  // 3. Update existing nodes
  for (const patch of delta.updateNodes ?? []) {
    const { id, ...rest } = patch;
    const dataPatch = rest as Record<string, unknown>;
    const result = updateNode(current, id, dataPatch);
    if (result.ok) current = result.doc;
  }

  // 4. Add explicit edges
  for (const edge of delta.addEdges ?? []) {
    const result = connectNodes(current, {
      source: edge.source,
      target: edge.target,
      ...(edge.buttonText ? { buttonText: edge.buttonText } : {}),
      ...(edge.branch ? { branch: edge.branch } : {}),
    });
    if (result.ok) current = result.doc;
  }

  return current;
}

export async function jsonRefineFlow(
  currentFlow: BotFlowDocument,
  instruction: string,
  chatHistory: ProjectChatMessage[] = [],
): Promise<{
  flow: BotFlowDocument;
  assistantMessage: string;
}> {
  const historySnippet = chatHistory
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Пользователь" : "Ассистент"}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const userContent =
    `Текущая схема:\n${buildFlowDigest(currentFlow)}\n\n` +
    (historySnippet ? `История:\n${historySnippet}\n\n` : "") +
    `Инструкция: ${instruction}`;

  const raw = await generateAiReply(REFINE_SYSTEM_PROMPT, userContent);
  const delta = parseRefineDelta(raw);

  const flow = applyLayoutToFlowDocument(applyDeltaToDoc(currentFlow, delta));

  return {
    flow,
    assistantMessage: delta.assistantMessage ?? "Сценарий обновлён.",
  };
}
