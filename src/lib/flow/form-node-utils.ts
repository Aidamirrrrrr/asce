import type { FormNodeData, FormQuestion, MessageKeyboard } from "@/lib/flow/flow-schema";

export function normalizeFormNodeData(data: FormNodeData): FormNodeData {
  return {
    label: data.label ?? "Форма",
    questions: Array.isArray(data.questions) ? data.questions : [],
  };
}

export function normalizeFormQuestion(q: FormQuestion): FormQuestion {
  return {
    prompt: q.prompt ?? "",
    variableKey: (q.variableKey ?? "field").replace(/^var\./, ""),
    type: q.type ?? "text",
  };
}

/** Строит reply-клавиатуру «Поделиться контактом» для вопроса type:contact. */
export function buildContactRequestKeyboard(): MessageKeyboard {
  return {
    type: "reply",
    rows: [[{ id: "contact", text: "Поделиться контактом", kind: "request_contact" }]],
    oneTime: true,
    resize: true,
  };
}

export function buildFormPreview(data: FormNodeData): string {
  const qs = data.questions ?? [];
  if (qs.length === 0) return "нет вопросов";
  const count = qs.length;
  const first = qs[0]?.prompt?.slice(0, 30) ?? "";
  return count === 1 ? first : `${first}… +${count - 1}`;
}
