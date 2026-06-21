import { describe, expect, it } from "vitest";

import { classifyComposerIntent } from "@/lib/ai/composer-intent";

describe("classifyComposerIntent heuristics", () => {
  it("routes analytics questions to data", async () => {
    await expect(classifyComposerIntent("Сколько пользователей в боте?")).resolves.toBe("data");
    await expect(classifyComposerIntent("Покажи последние заявки")).resolves.toBe("data");
  });

  it("routes flow edits to flow", async () => {
    await expect(classifyComposerIntent("Добавь кнопку «Контакты»")).resolves.toBe("flow");
    await expect(classifyComposerIntent("Удали узел с приветствием")).resolves.toBe("flow");
  });

  it("prefers flow when edit and stats mix", async () => {
    await expect(
      classifyComposerIntent("Добавь сообщение со статистикой пользователей"),
    ).resolves.toBe("flow");
  });

  it("routes greetings and small talk to chat", async () => {
    await expect(classifyComposerIntent("привет")).resolves.toBe("chat");
    await expect(classifyComposerIntent("как дела?")).resolves.toBe("chat");
    await expect(classifyComposerIntent("что ты умеешь")).resolves.toBe("chat");
    await expect(classifyComposerIntent("спасибо")).resolves.toBe("chat");
  });

  it("does not treat edits as chat even with a greeting verb", async () => {
    await expect(classifyComposerIntent("привет, добавь кнопку «Контакты»")).resolves.toBe("flow");
  });
});
