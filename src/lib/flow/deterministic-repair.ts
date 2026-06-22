/**
 * Детерминированный (без LLM) проход починки схемы.
 *
 * Чинит ТОЛЬКО однозначные структурные дефекты, где правильное действие не
 * требует семантического домысливания. Запускается ПЕРЕД LLM-repair, чтобы
 * снять с модели тривиальную работу и убрать целые классы ошибок бесплатно.
 *
 * Намеренно НЕ трогает то, что требует догадок (какая кнопка ведёт к экрану,
 * какой JSON-path извлекать) — это остаётся за LLM-repair.
 */
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { pruneInvalidEdges } from "@/lib/flow/flow-schema";
import { normalizeMessageNodeData } from "@/lib/flow/message-node-utils";

/** У message-узла есть ветвящие кнопки (inline callback или reply text)? */
function messageHasBranchButtons(node: BotFlowDocument["nodes"][number]): boolean {
  if (node.type !== "message") {
    return false;
  }
  const data = normalizeMessageNodeData(node.data);
  if (!data.keyboard) {
    return false;
  }
  if (data.keyboard.type === "inline") {
    return data.keyboard.rows.some((row) => row.some((button) => button.kind === "callback"));
  }
  if (data.keyboard.type === "reply") {
    return data.keyboard.rows.some((row) => row.some((button) => button.kind === "text"));
  }
  return false;
}

/**
 * Убрать «лишние» рёбра ветки next от меню с кнопками. Меню маршрутизирует
 * пользователя по кнопкам — прямое ребро next уводит всех в один экран в обход
 * выбора. Валидатор помечает это ошибкой; удаление здесь однозначно безопасно.
 */
function removeSpuriousNextFromMenus(doc: BotFlowDocument): {
  doc: BotFlowDocument;
  removed: number;
} {
  const branchMenuIds = new Set(doc.nodes.filter(messageHasBranchButtons).map((node) => node.id));
  if (branchMenuIds.size === 0) {
    return { doc, removed: 0 };
  }

  const kept = doc.edges.filter(
    (edge) => !(branchMenuIds.has(edge.source) && (edge.sourceHandle ?? "next") === "next"),
  );

  return { doc: { ...doc, edges: kept }, removed: doc.edges.length - kept.length };
}

export type DeterministicRepairResult = {
  doc: BotFlowDocument;
  changed: boolean;
  fixes: string[];
};

export function deterministicRepair(doc: BotFlowDocument): DeterministicRepairResult {
  const fixes: string[] = [];
  let current = doc;

  // 1. Убрать рёбра с битыми хендлами / на несуществующие узлы.
  const prunedEdges = pruneInvalidEdges(current.nodes, current.edges);
  if (prunedEdges.length !== current.edges.length) {
    fixes.push(`удалено битых рёбер: ${current.edges.length - prunedEdges.length}`);
    current = { ...current, edges: prunedEdges };
  }

  // 2. Снять лишние next-рёбра от меню с кнопками.
  const menus = removeSpuriousNextFromMenus(current);
  if (menus.removed > 0) {
    fixes.push(`снято лишних связей «Далее» от меню: ${menus.removed}`);
    current = menus.doc;
  }

  return { doc: current, changed: fixes.length > 0, fixes };
}
