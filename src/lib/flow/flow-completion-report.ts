import type { BotFlowDocument, MessageNodeData, TriggerNodeData } from "@/lib/flow/flow-schema";
import { buildUserSecretsChecklist } from "@/lib/flow/secret-recipes";

function collectKeyboardLabels(flow: BotFlowDocument): string[] {
  const labels = new Set<string>();

  for (const node of flow.nodes) {
    if (node.type !== "message") {
      continue;
    }

    const data = node.data as MessageNodeData;
    const keyboard = data.keyboard;
    if (!keyboard || keyboard.type === "remove") {
      continue;
    }

    for (const row of keyboard.rows) {
      for (const button of row) {
        if ("text" in button && button.text.trim()) {
          labels.add(button.text.trim());
        }
      }
    }
  }

  return [...labels];
}

function describeFlowStructure(flow: BotFlowDocument): string[] {
  const lines: string[] = [];
  const triggers = flow.nodes.filter((node) => node.type === "trigger");
  const waitInputs = flow.nodes.filter((node) => node.type === "wait_input");
  const httpRequests = flow.nodes.filter((node) => node.type === "http_request");
  const conditions = flow.nodes.filter((node) => node.type === "condition");

  const startTrigger = triggers.find((node) => {
    if (node.type !== "trigger") {
      return false;
    }
    const data = node.data as TriggerNodeData;
    return data.command === "/start" || /старт|start/i.test(data.label);
  });

  if (startTrigger && startTrigger.type === "trigger") {
    const command = (startTrigger.data as TriggerNodeData).command?.trim() || "/start";
    lines.push(`**Старт бота** — команда ${command}`);
  } else if (triggers.length > 0) {
    lines.push(`**Точки входа:** ${triggers.length}`);
  }

  const menuButtons = collectKeyboardLabels(flow);
  if (menuButtons.length > 0) {
    const preview = menuButtons.slice(0, 10).join(" · ");
    lines.push(`**Кнопки в боте:** ${preview}${menuButtons.length > 10 ? " и другие" : ""}`);
  }

  const branchLabels: string[] = [];
  for (const node of flow.nodes) {
    if (node.type !== "message") {
      continue;
    }

    const label = (node.data as MessageNodeData).label?.trim();
    if (label && label.length > 2 && !branchLabels.includes(label)) {
      branchLabels.push(label);
    }

    if (branchLabels.length >= 8) {
      break;
    }
  }

  if (branchLabels.length > 0) {
    lines.push(`**Шаги и ветки:** ${branchLabels.join(", ")}`);
  }

  if (waitInputs.length > 0) {
    lines.push(`**Сбор данных от пользователя:** ${waitInputs.length} пол(ей/я)`);
  }

  if (httpRequests.length > 0) {
    lines.push(`**Внешние сервисы:** ${httpRequests.length} подключени(е/я)`);
  }

  if (conditions.length > 0) {
    lines.push(`**Проверки и условия:** ${conditions.length}`);
  }

  return lines;
}

export function buildFlowCompletionReport(
  flow: BotFlowDocument,
  baseMessage: string,
  ...contextParts: Array<string | null | undefined | boolean>
): string {
  // Последний аргумент может быть флагом stepLimitReached (boolean).
  const lastArg = contextParts[contextParts.length - 1];
  const stepLimitReached = lastArg === true || lastArg === false ? (lastArg as boolean) : false;
  const parts = contextParts.filter((p): p is string | null | undefined => typeof p !== "boolean");

  const lines: string[] = [];
  const intro = baseMessage.trim() || "Сценарий собран на холсте.";
  lines.push(intro);

  const structure = describeFlowStructure(flow);
  if (structure.length > 0) {
    lines.push("", "## Что на холсте", "");
    for (const line of structure) {
      lines.push(`- ${line}`);
    }
  }

  // Не показываем инструкции по запуску, если схема собрана частично.
  if (stepLimitReached) {
    return lines.join("\n");
  }

  const checklist = buildUserSecretsChecklist(flow, ...parts);

  lines.push("", "## Перед запуском", "");

  if (checklist.items.length > 0) {
    lines.push(
      "Сценарий готов, но бот **не заработает полностью**, пока не заполните ключи.",
      "",
      "1. Откройте **Настройки проекта** (иконка шестерёнки на холсте).",
      "2. На вкладке **Бот** укажите токен от @BotFather.",
      "3. На вкладке **Секреты** заполните:",
      "",
    );

    for (const item of checklist.items) {
      lines.push(`- **${item.label}** — ${item.description}`);
      lines.push(`  - Где взять: ${item.howToGet}`);
    }

    if (checklist.notes.length > 0) {
      lines.push("", "**На заметку:**");
      for (const note of checklist.notes) {
        lines.push(`- ${note}`);
      }
    }

    lines.push("", "4. Нажмите **Запустить** на холсте.");
  } else {
    lines.push(
      "1. Откройте **Настройки проекта → Бот** и укажите токен от @BotFather.",
      "2. Нажмите **Запустить** на холсте.",
    );
  }

  return lines.join("\n");
}
