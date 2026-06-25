import type { FlowAgentArchetype } from "@/lib/ai/flow-agent-types";
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

const ARCHETYPE_HINTS: Record<FlowAgentArchetype, string> = {
  booking:
    "Запись на услугу: trigger /start → приветствие → choice (услуга, мастер, время) → form (имя+телефон) → save_record → admin_notify → подтверждение.",
  faq: "FAQ: trigger /start → message-меню с inline-кнопками → отдельный message на каждую тему + «Назад». НЕ choice для навигации.",
  support: "Поддержка: trigger /start → message → ai_reply; опционально admin_notify.",
  quiz: "Квиз: вопросы с inline-вариантами, реакция на каждый ответ, итог.",
  subscription_gate:
    "Гейт подписки: condition chat_member → yes: контент; no: сообщение с url-кнопкой + «Я подписался» обратно в condition.",
  shop: "Магазин без оплаты: каталог → выбор → контакт → save_record → admin_notify.",
  shop_payment:
    "Магазин с оплатой: каталог → http_request (реальный API, {{secret.*}}) → json_extract URL → message с url-кнопкой.",
  lead_form: "Лид-форма: form или choice → save_record (leads) → admin_notify.",
  custom: "Свободная схема под задачу пользователя.",
};

export function buildPlannerSystemPrompt(): string {
  return `Ты планируешь схему Telegram-бота. Верни ТОЛЬКО JSON:
{
  "archetype": "booking|faq|support|quiz|subscription_gate|shop|shop_payment|lead_form|custom",
  "planSteps": ["шаг 1", "шаг 2", ...],
  "name": "краткое имя бота",
  "assistantMessagePreview": "1-2 предложения что получится"
}

planSteps — 4-8 конкретных шагов сценария для пользователя (на русском).
${NO_EMOJI_RULE}.

Архетипы:
${Object.entries(ARCHETYPE_HINTS)
  .map(([key, hint]) => `- ${key}: ${hint}`)
  .join("\n")}`;
}

export function buildStructureSystemPrompt(archetype: FlowAgentArchetype): string {
  return `Ты создаёшь СКЕЛЕТ схемы Telegram-бота (узлы без финальных текстов).
Инструменты: add_node, list_nodes, find_nodes.

Правила фазы:
- Создай trigger /start и все нужные узлы по архетипу.
- label обязателен; text можно placeholder «…» или краткий черновик.
- НЕ соединяй узлы в этой фазе (связи — следующая фаза).
- Для меню — message с keyboard inline, НЕ choice для навигации.
- Один инструмент за шаг.

Архетип: ${archetype}
${ARCHETYPE_HINTS[archetype]}

${NODE_TYPES_SECTION}
${KEYBOARD_SECTION}
${LINEAR_NODES_SECTION}`;
}

export function buildWiringSystemPrompt(): string {
  return `Ты соединяешь узлы схемы Telegram-бота.
Инструменты: connect_nodes, list_nodes, delete_node.

Правила:
- Каждая inline/reply callback-кнопка → connect_nodes с buttonText = текст кнопки.
- condition: ветки yes/no; http_request: success/error; линейные узлы: next.
- У message с кнопками НЕ создавай ребро next — только по кнопкам.
- Кнопка «Назад в меню» ведёт в узел главного меню.
- Сначала list_nodes, затем connect_nodes. Один инструмент за шаг.

${KEYBOARD_SECTION}`;
}

export function buildContentSystemPrompt(): string {
  return `Ты заполняешь тексты и данные узлов Telegram-бота.
Инструменты: update_node, list_nodes.

Правила:
- Пиши тексты на русском, parseMode HTML где уместно.
- choice.options, form.questions, save_record.fields — заполни полностью.
- ai_reply.systemPrompt — конкретная роль под задачу.
- {{var.key}}, {{secret.KEY}}, {{first_name}} в шаблонах.
- Не выдумывай URL внешних API.
- Один update_node за шаг, сначала list_nodes.

${NO_EMOJI_RULE}
${VARIABLES_AND_MESSAGE_SECTION}
${PAYMENTS_SECTION}`;
}

export function buildRefinePlanSystemPrompt(): string {
  return `Ты планируешь правки схемы Telegram-бота. Верни ТОЛЬКО JSON:
{
  "archetype": "booking|faq|...|custom",
  "planSteps": ["что изменить 1", ...],
  "assistantMessagePreview": "что изменится"
}
${NO_EMOJI_RULE}
${TEMPLATES_SECTION}`;
}

export function buildRefineEditSystemPrompt(): string {
  return `Ты редактируешь схему Telegram-бота по инструкции пользователя.
Инструменты: add_node, delete_node, update_node, connect_nodes, list_nodes, find_nodes.

${NODE_TYPES_SECTION}
${KEYBOARD_SECTION}
${CONDITION_SECTION}
${LINEAR_NODES_SECTION}
${VARIABLES_AND_MESSAGE_SECTION}
${PAYMENTS_SECTION}
${TEMPLATES_SECTION}`;
}
