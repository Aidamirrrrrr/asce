import { GrammyError } from "grammy";
import { describe, expect, it } from "vitest";

import { formatTelegramBotApiError } from "@/lib/bot/telegram-api-errors";

describe("formatTelegramBotApiError", () => {
  it("maps Telegram 404 to invalid token hint", () => {
    const error = new GrammyError("Not Found", {
      method: "setWebhook",
      ok: false,
      error_code: 404,
      description: "Not Found",
      parameters: {},
    });

    expect(formatTelegramBotApiError(error, "Webhook")).toMatch(/неверный токен бота/i);
  });
});
