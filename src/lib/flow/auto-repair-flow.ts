import { splitIntoTriggerLanes } from "@/lib/flow/flow-layout";
import type { BotFlowDocument, FlowNode } from "@/lib/flow/flow-schema";
import { addNode, connectNodes } from "@/lib/flow/flow-tools";

/**
 * Детерминированный авто-ремонт схемы — последний рубеж после агентного цикла.
 *
 * LLM иногда не дочинивает связи за отведённые раунды коррекции. Эта чистая
 * функция гарантированно дозашивает то, что чинится однозначно:
 *  - http_request без ветки «ошибка» -> ведём в общий fallback-узел;
 *  - condition без ветки «нет» -> ведём в тот же fallback;
 *  - trigger без исходящей связи -> подключаем к осиротевшему узлу дорожки
 *    (или к fallback);
 *  - недостижимые узлы -> подключаем, но ТОЛЬКО когда источник однозначен.
 *
 * Никаких догадок про основную логику (ветки «да»/«успех» не выдумываем) —
 * их оставляем агенту/валидатору, чтобы не склеить сценарий неверно.
 */

export type FlowRepairResult = {
  doc: BotFlowDocument;
  repairs: string[];
};

const FALLBACK_MESSAGE_TEXT =
  "Извините, не удалось обработать запрос. Попробуйте позже или начните заново с /start.";

function getNodeLabel(node: FlowNode): string {
  const data = node.data as { label?: unknown } | undefined;
  return data && typeof data.label === "string" && data.label.trim() ? data.label.trim() : node.id;
}

/** Хендлы исходящих рёбер узла (sourceHandle, по умолчанию "next"). */
function outgoingHandles(doc: BotFlowDocument, nodeId: string): Set<string> {
  const handles = new Set<string>();
  for (const edge of doc.edges) {
    if (edge.source === nodeId) {
      handles.add(edge.sourceHandle ?? "next");
    }
  }
  return handles;
}

/** Основная (логическая) ветка узла, которую можно занять для линейного продолжения. */
function primaryHandle(node: FlowNode): "next" | "yes" | "success" {
  if (node.type === "condition") {
    return "yes";
  }
  if (node.type === "http_request") {
    return "success";
  }
  return "next";
}

/** Множество узлов, достижимых из триггеров (по аналогии с findUnreachableNodes). */
function reachableNodeIds(doc: BotFlowDocument): Set<string> {
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
    const current = queue.shift() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  return reachable;
}

export function autoRepairFlowDocument(doc: BotFlowDocument): FlowRepairResult {
  let current = doc;
  const repairs: string[] = [];

  // Общий fallback-узел создаём лениво — только если он реально нужен.
  let fallbackId: string | null = null;
  const ensureFallback = (): string | null => {
    if (fallbackId) {
      return fallbackId;
    }
    const result = addNode(current, {
      type: "message",
      data: { label: "Не удалось обработать", text: FALLBACK_MESSAGE_TEXT },
    });
    if (!result.ok) {
      return null;
    }
    current = result.doc;
    fallbackId = result.data?.nodeId ?? null;
    if (fallbackId) {
      repairs.push("Добавлен запасной узел-сообщение для необработанных веток");
    }
    return fallbackId;
  };

  const connect = (source: string, target: string, branch: "next" | "no" | "error"): boolean => {
    const result = connectNodes(current, { source, target, branch });
    if (!result.ok) {
      return false;
    }
    current = result.doc;
    return true;
  };

  // 1. http_request без ветки «ошибка» -> fallback.
  for (const node of current.nodes.filter((item) => item.type === "http_request")) {
    if (outgoingHandles(current, node.id).has("error")) {
      continue;
    }
    const fb = ensureFallback();
    if (fb && connect(node.id, fb, "error")) {
      repairs.push(`HTTP-запрос «${getNodeLabel(node)}»: подключена ветка «ошибка»`);
    }
  }

  // 2. condition без ветки «нет» -> fallback.
  for (const node of current.nodes.filter((item) => item.type === "condition")) {
    if (outgoingHandles(current, node.id).has("no")) {
      continue;
    }
    const fb = ensureFallback();
    if (fb && connect(node.id, fb, "no")) {
      repairs.push(`Условие «${getNodeLabel(node)}»: подключена ветка «нет»`);
    }
  }

  // 3. trigger без исходящей связи -> осиротевший узел дорожки или fallback.
  const triggersWithoutOut = current.nodes.filter(
    (node) => node.type === "trigger" && outgoingHandles(current, node.id).size === 0,
  );
  if (triggersWithoutOut.length > 0) {
    const lanes = splitIntoTriggerLanes(current.nodes);
    const laneOf = new Map<string, FlowNode[]>();
    for (const lane of lanes) {
      const trigger = lane.find((node) => node.type === "trigger");
      if (trigger) {
        laneOf.set(trigger.id, lane);
      }
    }

    for (const trigger of triggersWithoutOut) {
      const hasIncoming = (id: string) => current.edges.some((edge) => edge.target === id);
      const lane = laneOf.get(trigger.id) ?? [];
      const orphan = lane.find(
        (node) => node.type !== "trigger" && !hasIncoming(node.id) && node.id !== trigger.id,
      );

      const target = orphan?.id ?? ensureFallback();
      if (target && connect(trigger.id, target, "next")) {
        repairs.push(
          orphan
            ? `Триггер «${getNodeLabel(trigger)}» подключён к «${getNodeLabel(orphan)}»`
            : `Триггер «${getNodeLabel(trigger)}» подключён к запасному узлу`,
        );
      }
    }
  }

  // 3.5. Схождение веток: меню -> set_variable(выбор) -> общий сбор данных.
  // Частый недочёт генерации: агент достраивает продолжение (имя/телефон/заявка)
  // только для ОДНОЙ кнопки — или создаёт общий узел, но не подключает к нему ветки.
  const lanes = splitIntoTriggerLanes(current.nodes);
  const reachable = reachableNodeIds(current);

  const hasIncoming = (nodeId: string): boolean =>
    current.edges.some((edge) => edge.target === nodeId);

  const nextTargetOf = (nodeId: string): string | undefined =>
    current.edges.find((edge) => edge.source === nodeId && (edge.sourceHandle ?? "next") === "next")
      ?.target;

  const findOrphanMergeHead = (lane: FlowNode[]): FlowNode | undefined => {
    const candidates = lane.filter(
      (node) =>
        (node.type === "message" || node.type === "wait_input" || node.type === "save_record") &&
        !hasIncoming(node.id) &&
        !reachable.has(node.id),
    );

    return candidates.length === 1 ? candidates[0] : undefined;
  };

  const parentIds = new Set(current.edges.map((edge) => edge.source));
  for (const parentId of parentIds) {
    const childIds = [
      ...new Set(current.edges.filter((edge) => edge.source === parentId).map((e) => e.target)),
    ];
    const setVarChildren = childIds
      .map((id) => current.nodes.find((node) => node.id === id))
      .filter((node): node is FlowNode => node?.type === "set_variable");
    if (setVarChildren.length < 2) {
      continue;
    }

    const dangling = setVarChildren.filter((child) => !nextTargetOf(child.id));
    if (dangling.length === 0) {
      continue;
    }

    const continuations = new Set(
      setVarChildren.map((child) => nextTargetOf(child.id)).filter((id): id is string => !!id),
    );

    let target: string | undefined;

    if (continuations.size === 1) {
      target = [...continuations][0];
    } else if (continuations.size === 0) {
      const lane = lanes.find((items) => items.some((item) => item.id === parentId)) ?? [];
      target = findOrphanMergeHead(lane)?.id;
    }

    if (!target) {
      continue;
    }

    for (const child of dangling) {
      if (child.id === target) {
        continue;
      }
      if (connect(child.id, target, "next")) {
        repairs.push(`Ветка «${getNodeLabel(child)}» подключена к общему продолжению`);
      }
    }
  }

  // 4. Недостижимые узлы -> подключаем ТОЛЬКО при однозначном источнике.
  // Источник однозначен, если в той же дорожке ровно один достижимый узел
  // со свободной основной веткой.
  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    const reachable = reachableNodeIds(current);
    const unreachable = current.nodes.filter(
      (node) => node.type !== "trigger" && !reachable.has(node.id),
    );

    for (const node of unreachable) {
      const lane = lanes.find((items) => items.some((item) => item.id === node.id)) ?? [];
      const candidates = lane.filter(
        (item) =>
          item.id !== node.id &&
          reachable.has(item.id) &&
          !outgoingHandles(current, item.id).has(primaryHandle(item)),
      );

      if (candidates.length !== 1) {
        continue;
      }
      const source = candidates[0];
      const handle = primaryHandle(source);
      const result = connectNodes(current, { source: source.id, target: node.id, branch: handle });
      if (result.ok) {
        current = result.doc;
        repairs.push(
          `Узел «${getNodeLabel(node)}» подключён к «${getNodeLabel(source)}» (был недостижим)`,
        );
        madeProgress = true;
        break; // пересчитать достижимость
      }
    }
  }

  return { doc: current, repairs };
}
