/**
 * Сухой прогон (dry-run) сценария бота без реального Telegram.
 *
 * Зачем, если есть валидатор: валидатор статичен и проверяет «производится ли
 * переменная где-нибудь». Симулятор проходит граф ПО ПОРЯДКУ и ловит то, что
 * статика не видит:
 *   - переменная используется РАНЬШЕ, чем создаётся выше по сценарию
 *     (глобально она есть, но на этом пути ещё не заполнена);
 *   - бесконечный авто-цикл без шага ввода (бот зациклится сам на себе);
 *   - текстовое превью диалога «как увидит пользователь» до публикации.
 */
import type { BotFlowDocument, FlowNode } from "@/lib/flow/flow-schema";
import { collectDeclaredVariableKeys } from "@/lib/flow/set-variable-node-utils";
import { interpolateTemplate, TEMPLATE_VAR_KEYS } from "@/lib/flow/template-vars";

const BUILTIN_KEYS = new Set<string>(TEMPLATE_VAR_KEYS);
const TEMPLATE_REFERENCE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;
const MAX_TRANSCRIPT_STEPS = 40;

export type SimulationIssue = {
  severity: "error" | "warning";
  message: string;
  nodeLabel?: string;
};

export type TranscriptStep = {
  nodeId: string;
  type: string;
  label: string;
  /** Отрендеренный текст сообщения (для message), либо краткое описание шага. */
  text: string;
};

export type SimulationResult = {
  issues: SimulationIssue[];
  transcript: TranscriptStep[];
};

function nodeLabel(node: FlowNode): string {
  const data = node.data as { label?: unknown };
  return typeof data?.label === "string" && data.label.trim() ? data.label.trim() : node.id;
}

function producedByNode(node: FlowNode): string[] {
  return collectDeclaredVariableKeys([node]);
}

function consumedByNode(node: FlowNode): string[] {
  const serialized = JSON.stringify(node.data ?? {});
  const keys = new Set<string>();
  for (const match of serialized.matchAll(TEMPLATE_REFERENCE_PATTERN)) {
    const raw = match[1] ?? "";
    if (raw.startsWith("secret.") || BUILTIN_KEYS.has(raw)) {
      continue;
    }
    const candidate = raw.replace(/^var\./, "");
    if (candidate) {
      keys.add(candidate);
    }
  }
  return [...keys];
}

/** Множество узлов-предков (которые могут достичь target), без самого target. */
function ancestorsOf(doc: BotFlowDocument, targetId: string): Set<string> {
  const reverse = new Map<string, string[]>();
  for (const edge of doc.edges) {
    const list = reverse.get(edge.target) ?? [];
    list.push(edge.source);
    reverse.set(edge.target, list);
  }
  const seen = new Set<string>();
  const queue = [...(reverse.get(targetId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const parent of reverse.get(current) ?? []) {
      queue.push(parent);
    }
  }
  return seen;
}

/** Узел требует ввода пользователя (значит цикл через него не «бесконечный»)? */
function isUserInputNode(node: FlowNode): boolean {
  if (node.type === "choice" || node.type === "form" || node.type === "wait_input") {
    return true;
  }
  if (node.type === "message") {
    const keyboard = (node.data as { keyboard?: { type?: string; rows?: unknown[] } }).keyboard;
    return Boolean(keyboard && keyboard.type !== "remove" && (keyboard.rows?.length ?? 0) > 0);
  }
  return false;
}

/** Order-aware проверка: переменная используется раньше, чем создаётся выше по пути. */
function findUseBeforeProduce(doc: BotFlowDocument): SimulationIssue[] {
  const producedAnywhere = new Set(collectDeclaredVariableKeys(doc.nodes, doc.variables ?? []));
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const issues: SimulationIssue[] = [];

  for (const node of doc.nodes) {
    const consumed = consumedByNode(node);
    if (consumed.length === 0) {
      continue;
    }
    const ancestors = ancestorsOf(doc, node.id);
    const upstream = new Set<string>();
    for (const ancestorId of ancestors) {
      const ancestor = nodeById.get(ancestorId);
      if (ancestor) {
        for (const key of producedByNode(ancestor)) {
          upstream.add(key);
        }
      }
    }
    // Узел может производить переменную и сразу использовать её в своих же полях.
    for (const key of producedByNode(node)) {
      upstream.add(key);
    }

    const lateVars = consumed.filter(
      // Глобально существует (иначе это поймает статический валидатор как «не заполняется»),
      // но выше по этому пути ещё не создана — значит уйдёт пустой именно здесь.
      (key) => producedAnywhere.has(key) && !upstream.has(key),
    );

    if (lateVars.length > 0) {
      issues.push({
        severity: "error",
        message: `Переменные используются раньше, чем создаются выше по сценарию: ${lateVars
          .map((key) => `{{var.${key}}}`)
          .join(", ")}. Переставь шаг-источник выше этого узла.`,
        nodeLabel: nodeLabel(node),
      });
    }
  }

  return issues;
}

/** Поиск бесконечного авто-цикла: цикл в графе без единого шага ввода пользователя. */
function findAutoLoops(doc: BotFlowDocument): SimulationIssue[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of doc.edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));

  const issues: SimulationIssue[] = [];
  const reported = new Set<string>();
  const colour = new Map<string, 0 | 1 | 2>(); // 0=white,1=grey,2=black
  const stack: string[] = [];

  const visit = (id: string): void => {
    colour.set(id, 1);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const state = colour.get(next) ?? 0;
      if (state === 1) {
        // Найден обратный ход — выделяем цикл из стека.
        const cycleStart = stack.indexOf(next);
        const cycle = stack.slice(cycleStart);
        const hasInput = cycle.some((nodeId) => {
          const node = nodeById.get(nodeId);
          return node ? isUserInputNode(node) : false;
        });
        const key = [...cycle].sort().join("|");
        if (!(hasInput || reported.has(key))) {
          reported.add(key);
          const labels = cycle
            .map((nodeId) => {
              const node = nodeById.get(nodeId);
              return node ? nodeLabel(node) : nodeId;
            })
            .join(" → ");
          issues.push({
            severity: "warning",
            message: `Возможный бесконечный цикл без шага ввода: ${labels}. Бот зациклится — добавь кнопку/ввод или условие выхода.`,
          });
        }
      } else if (state === 0) {
        visit(next);
      }
    }
    stack.pop();
    colour.set(id, 2);
  };

  for (const node of doc.nodes) {
    if ((colour.get(node.id) ?? 0) === 0) {
      visit(node.id);
    }
  }

  return issues;
}

function pickPrimaryEdge(
  doc: BotFlowDocument,
  node: FlowNode,
): { target: string; handle: string } | null {
  const outgoing = doc.edges.filter((edge) => edge.source === node.id);
  if (outgoing.length === 0) {
    return null;
  }
  const prefer = (handle: string) =>
    outgoing.find((edge) => (edge.sourceHandle ?? "next") === handle);
  const chosen =
    prefer("next") ??
    prefer("yes") ??
    prefer("success") ??
    outgoing.find((edge) => (edge.sourceHandle ?? "").startsWith("btn-")) ??
    outgoing[0];
  return chosen ? { target: chosen.target, handle: chosen.sourceHandle ?? "next" } : null;
}

/** Линейное превью «happy path» от первого триггера для показа пользователю. */
function buildTranscript(doc: BotFlowDocument): TranscriptStep[] {
  const triggers = doc.nodes.filter((n) => n.type === "trigger");
  const start =
    triggers.find((n) => {
      const command = (n.data as { command?: string }).command;
      return command === "/start";
    }) ?? triggers[0];
  if (!start) {
    return [];
  }

  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const vars: Record<string, string> = {
    nickname: "Алексей",
    first_name: "Алексей",
    username: "alexey",
    user_id: "123456789",
  };

  const transcript: TranscriptStep[] = [];
  const visited = new Set<string>();
  let current: FlowNode | undefined = start;
  let steps = 0;

  while (current && steps < MAX_TRANSCRIPT_STEPS) {
    steps += 1;
    if (visited.has(current.id)) {
      transcript.push({
        nodeId: current.id,
        type: current.type,
        label: nodeLabel(current),
        text: "↩︎ возврат к уже показанному шагу",
      });
      break;
    }
    visited.add(current.id);

    for (const key of producedByNode(current)) {
      vars[`var.${key}`] = `‹${key}›`;
    }

    if (current.type === "message") {
      const text = String((current.data as { text?: string }).text ?? "").trim();
      if (text) {
        transcript.push({
          nodeId: current.id,
          type: current.type,
          label: nodeLabel(current),
          text: interpolateTemplate(text, vars, "HTML"),
        });
      }
    } else if (current.type === "choice") {
      const prompt = String((current.data as { prompt?: string }).prompt ?? "").trim();
      transcript.push({
        nodeId: current.id,
        type: current.type,
        label: nodeLabel(current),
        text: prompt || "(выбор варианта)",
      });
    } else if (current.type === "form") {
      const questions =
        (current.data as { questions?: Array<{ prompt?: string }> }).questions ?? [];
      const first = questions[0]?.prompt ?? "(сбор данных)";
      transcript.push({
        nodeId: current.id,
        type: current.type,
        label: nodeLabel(current),
        text: first,
      });
    }

    const nextEdge = pickPrimaryEdge(doc, current);
    current = nextEdge ? nodeById.get(nextEdge.target) : undefined;
  }

  return transcript;
}

export function simulateFlow(doc: BotFlowDocument): SimulationResult {
  return {
    issues: [...findUseBeforeProduce(doc), ...findAutoLoops(doc)],
    transcript: buildTranscript(doc),
  };
}

/** Markdown-превью диалога для отчёта в чате конструктора. */
export function formatTranscriptPreview(transcript: TranscriptStep[]): string | null {
  if (transcript.length === 0) {
    return null;
  }
  const lines = transcript.map((step) => {
    if (step.text.startsWith("↩︎")) {
      return `- ${step.text}`;
    }
    const snippet = step.text
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    return `- **${step.label}:** ${snippet}`;
  });
  return `## Превью диалога\n\n${lines.join("\n")}`;
}
