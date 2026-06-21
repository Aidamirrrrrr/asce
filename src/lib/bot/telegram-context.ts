import type { Context } from "grammy";

import type { TelegramTemplateVars } from "@/lib/flow/template-vars";

export function buildTelegramVars(ctx: Context): TelegramTemplateVars {
  const from = ctx.from;
  const firstName = from?.first_name?.trim() || "друг";

  return {
    nickname: firstName,
    first_name: firstName,
    username: from?.username ?? "",
    user_id: from?.id != null ? String(from.id) : "",
  };
}
