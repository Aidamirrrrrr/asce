import type { ChoiceNodeData, MessageKeyboard } from "@/lib/flow/flow-schema";

export function normalizeChoiceNodeData(data: ChoiceNodeData): ChoiceNodeData {
  return {
    label: data.label ?? "Выбор",
    prompt: data.prompt ?? "Выберите вариант:",
    variableKey: (data.variableKey ?? "choice").replace(/^var\./, ""),
    options: Array.isArray(data.options) ? data.options : [],
    parseMode: data.parseMode ?? "HTML",
  };
}

/** Строит inline-клавиатуру из вариантов choice-ноды.
 *  ID каждой кнопки = строковый индекс (0, 1, 2, …), чтобы по callback определить выбор. */
export function buildChoiceKeyboard(data: ChoiceNodeData): MessageKeyboard {
  const rows = data.options.map((opt, i) => [
    { id: String(i), text: opt.text, kind: "callback" as const },
  ]);
  return { type: "inline", rows };
}

/** Возвращает значение выбранного варианта по строковому индексу из callback. */
export function resolveChoiceValue(data: ChoiceNodeData, buttonId: string): string | null {
  const index = parseInt(buttonId, 10);
  if (Number.isNaN(index) || index < 0 || index >= data.options.length) {
    return null;
  }
  const opt = data.options[index];
  return opt ? (opt.value ?? opt.text) : null;
}

export function buildChoicePreview(data: ChoiceNodeData): string {
  const opts = data.options ?? [];
  const preview = opts
    .slice(0, 3)
    .map((o) => o.text)
    .join(" · ");
  return opts.length > 3 ? `${preview} · …` : preview;
}
