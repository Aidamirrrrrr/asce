import type { Api } from "grammy";

import type { ExecutionContext } from "@/lib/bot/execution-context";
import type { ConditionNodeData, ConditionRule } from "@/lib/flow/flow-schema";

export const MAX_CHAT_MEMBERSHIP_CHECKS = 10;

type ChatMember = Awaited<ReturnType<Api["getChatMember"]>>;

export function isChatMemberSubscribed(member: ChatMember): boolean {
  switch (member.status) {
    case "creator":
    case "administrator":
    case "member":
      return true;
    case "restricted":
      return member.is_member === true;
    case "left":
    case "kicked":
      return false;
    default:
      return false;
  }
}

export type MembershipCheckCache = Map<string, boolean>;

export async function checkChatMembership(
  api: Api,
  chatId: string,
  userId: number,
  cache: MembershipCheckCache,
): Promise<boolean> {
  const cacheKey = `${chatId}:${userId}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? false;
  }

  try {
    const member = await api.getChatMember(chatId, userId);
    const subscribed = isChatMemberSubscribed(member);
    cache.set(cacheKey, subscribed);
    return subscribed;
  } catch {
    cache.set(cacheKey, false);
    return false;
  }
}

function evaluateLocalRule(rule: ConditionRule, context: ExecutionContext): boolean | null {
  if (rule.type === "is_premium") {
    return context.isPremium === rule.expected;
  }

  if (rule.type === "has_username") {
    return context.hasUsername === rule.expected;
  }

  if (rule.type === "start_param") {
    const actual = context.startParam ?? "";
    if (rule.operator === "contains") {
      return actual.includes(rule.value);
    }
    return actual === rule.value;
  }

  return null;
}

async function evaluateChatMemberRule(
  rule: Extract<ConditionRule, { type: "chat_member" }>,
  _context: ExecutionContext,
  checkMembership: (chatId: string) => Promise<boolean>,
): Promise<boolean> {
  const chatIds = rule.chatIds.slice(0, MAX_CHAT_MEMBERSHIP_CHECKS);
  if (chatIds.length === 0) {
    return false;
  }

  const results = await Promise.all(chatIds.map((chatId) => checkMembership(chatId)));

  if (rule.chatMatchMode === "any") {
    return results.some(Boolean);
  }

  return results.every(Boolean);
}

export async function evaluateConditionRules(
  data: ConditionNodeData,
  context: ExecutionContext,
  checkMembership: (chatId: string) => Promise<boolean>,
): Promise<boolean> {
  if (data.rules.length === 0) {
    return false;
  }

  const results: boolean[] = [];

  for (const rule of data.rules) {
    const local = evaluateLocalRule(rule, context);
    if (local !== null) {
      results.push(local);
      continue;
    }

    if (rule.type === "chat_member") {
      results.push(await evaluateChatMemberRule(rule, context, checkMembership));
    }
  }

  if (data.matchMode === "any") {
    return results.some(Boolean);
  }

  return results.every(Boolean);
}

export function parseStartParam(messageText: string): string | undefined {
  const trimmed = messageText.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  if (!command?.startsWith("/start")) {
    return undefined;
  }

  const payload = rest.join(" ").trim();
  return payload || undefined;
}
