import type { TelegramParseMode } from "@/lib/flow/flow-schema";

export const TEMPLATE_VAR_KEYS = ["nickname", "first_name", "username", "user_id"] as const;

export type TemplateVarKey = (typeof TEMPLATE_VAR_KEYS)[number];

export type TelegramTemplateVars = Record<TemplateVarKey, string>;

export type TemplateVars = Record<string, string>;

export const TEMPLATE_VAR_DEFINITIONS: ReadonlyArray<{
  key: TemplateVarKey;
  label: string;
  template: string;
}> = [
  { key: "nickname", label: "Имя", template: "{{nickname}}" },
  { key: "first_name", label: "Имя (first_name)", template: "{{first_name}}" },
  { key: "username", label: "Username", template: "{{username}}" },
  { key: "user_id", label: "ID пользователя", template: "{{user_id}}" },
];

export const DEFAULT_PREVIEW_NICKNAME = "Алексей";

export function buildPreviewTemplateVars(
  nickname: string,
  customVars: Record<string, string> = {},
): TemplateVars {
  const trimmed = nickname.trim() || DEFAULT_PREVIEW_NICKNAME;

  return {
    nickname: trimmed,
    first_name: trimmed,
    username: "alexey",
    user_id: "123456789",
    ...customVars,
  };
}

export function buildPreviewCustomVars(variableKeys: string[]): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const key of variableKeys) {
    const normalized = key.replace(/^var\./, "");
    vars[`var.${normalized}`] = `пример_${normalized}`;
  }

  return vars;
}

const TEMPLATE_VAR_PATTERN = /\{\{([\w.]+)\}\}/g;

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeMarkdownV2(value: string): string {
  return value.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export function resolveTemplateKey(key: string, vars: TemplateVars): string {
  if (key in vars) {
    return vars[key] ?? "";
  }

  if (key.startsWith("var.")) {
    return vars[key] ?? "";
  }

  if (key.startsWith("secret.")) {
    return vars[key] ?? "";
  }

  return "";
}

export function interpolateTemplate(
  text: string,
  vars: TemplateVars,
  parseMode: TelegramParseMode = "HTML",
): string {
  return text.replace(TEMPLATE_VAR_PATTERN, (_match, key: string) => {
    const value = resolveTemplateKey(key, vars);

    if (parseMode === "HTML") {
      return escapeHtml(value);
    }

    if (parseMode === "MarkdownV2") {
      return escapeMarkdownV2(value);
    }

    return value;
  });
}

export function textContainsSecretReference(text: string): boolean {
  return /\{\{secret\.[\w.]+\}\}/.test(text);
}

export function mergeTemplateVars(
  telegramVars: TelegramTemplateVars,
  userVars: Record<string, string> = {},
  secretVars: Record<string, string> = {},
  defaultVars: Record<string, string> = {},
): TemplateVars {
  const merged: TemplateVars = { ...telegramVars };

  for (const [key, value] of Object.entries(defaultVars)) {
    const normalized = key.startsWith("var.") ? key : `var.${key}`;
    merged[normalized] = value;
  }

  for (const [key, value] of Object.entries(userVars)) {
    merged[key.startsWith("var.") ? key : `var.${key}`] = value;
  }

  for (const [key, value] of Object.entries(secretVars)) {
    merged[key.startsWith("secret.") ? key : `secret.${key}`] = value;
  }

  return merged;
}

export function extractSecretKeysFromFlow(flowJson: string | null | undefined): string[] {
  if (!flowJson?.trim()) {
    return [];
  }

  const keys = new Set<string>();
  const pattern = /\{\{secret\.([\w.]+)\}\}/g;
  let match = pattern.exec(flowJson);

  while (match) {
    keys.add(match[1] ?? "");
    match = pattern.exec(flowJson);
  }

  return [...keys].filter(Boolean);
}
