import { generateAiReply } from "@/lib/ai/ai-client";
import type { ProjectChatMessage } from "@/lib/projects";

export type ComposerIntent = "flow" | "data" | "chat";

const DATA_MUTATION_PATTERN =
  /(удали|удалить|очисти|очистить|убери|убрать).*(заявк|запис|лид|коллекци|данн)/i;

const FLOW_EDIT_PATTERN =
  /(добав(ь|ить|ьте)|удали|удалить|измени|изменить|поменяй|создай|сделай|перепиши|подключи|свяжи|настрой|убери|вставь|перенес|перемест|обнови сценар|сценари|узел|узл|нод|блок|кнопк|триггер|ветк|связ|холст|callback|keyboard)/i;

const DATA_QUERY_PATTERN =
  /(сколько|число|количеств|статистик|аналитик|пользовател|юзер|активн|новых|заблок|команд|ошибк|воронк|заявк|запис|лид|коллекци|собран|сохранен|пришло|покажи послед|список заяв|какие заяв|данные бота|кто писал|последние заяв)/i;

// Болтовня и общие вопросы: приветствия, благодарности, вопросы про сам сервис.
// Используем (?!\p{L}) вместо \b — \b не работает после кириллицы без Unicode-режима.
const CHAT_PATTERN =
  /^\s*(привет|здравствуй|здаров|хай|hi|hello|йо|ку|добр(ый|ое|ого) (день|вечер|утр[оа])|как дела|как ты|как сам|что нового|спасибо|спс|благодарю|пока|до свидания|ок|окей|кто ты|ты кто|что ты умеешь|что умеешь|что ты можешь|что можешь|как (это )?работает|как (тут |этим )?пользоваться|как пользоваться|помоги разобраться|чем поможешь)(?!\p{L})/iu;

function heuristicIntent(message: string): ComposerIntent | null {
  const text = message.trim();
  if (!text) {
    return null;
  }

  // Болтовню ловим первой, но только если это не правка/запрос данных.
  if (CHAT_PATTERN.test(text) && !(FLOW_EDIT_PATTERN.test(text) || DATA_QUERY_PATTERN.test(text))) {
    return "chat";
  }

  const flow = FLOW_EDIT_PATTERN.test(text);
  const data = DATA_QUERY_PATTERN.test(text) || DATA_MUTATION_PATTERN.test(text);

  if (DATA_MUTATION_PATTERN.test(text)) {
    return "data";
  }

  if (data && !flow) {
    return "data";
  }
  if (flow) {
    return "flow";
  }

  return null;
}

function buildClassifierContext(chatHistory: ProjectChatMessage[]): string {
  const snippet = chatHistory
    .slice(-4)
    .map(
      (message) => `${message.role === "user" ? "Пользователь" : "Ассистент"}: ${message.content}`,
    )
    .join("\n");

  return snippet ? `Контекст чата:\n${snippet}\n\n` : "";
}

async function classifyWithLlm(
  userMessage: string,
  chatHistory: ProjectChatMessage[],
): Promise<ComposerIntent> {
  const reply = await generateAiReply(
    `Ты классификатор намерений владельца Telegram-бота.
Ответь ровно одним словом:
- flow — если нужно изменить сценарий бота (узлы, кнопки, сообщения, связи, логику).
- data — если нужно узнать статистику, пользователей, заявки, записи или другие данные бота из базы.
- chat — если это обычный разговор: приветствие, благодарность, вопрос о сервисе или как им пользоваться, и НЕ требует правки сценария или данных.`,
    `${buildClassifierContext(chatHistory)}Сообщение: ${userMessage}`,
  );

  const normalized = reply.trim().toLowerCase();
  if (normalized.includes("data")) {
    return "data";
  }
  if (normalized.includes("chat")) {
    return "chat";
  }
  return "flow";
}

/** Определяет: правка сценария, вопрос о данных бота или обычный разговор. */
export async function classifyComposerIntent(
  userMessage: string,
  chatHistory: ProjectChatMessage[] = [],
): Promise<ComposerIntent> {
  const heuristic = heuristicIntent(userMessage);
  if (heuristic) {
    return heuristic;
  }

  try {
    return await classifyWithLlm(userMessage, chatHistory);
  } catch {
    return "flow";
  }
}
