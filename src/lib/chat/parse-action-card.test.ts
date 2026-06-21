import { describe, expect, it } from "vitest";
import { classifyComposerIntent } from "@/lib/ai/composer-intent";
import { parsePresentActionCardArgs } from "@/lib/chat/parse-action-card";

describe("parsePresentActionCardArgs", () => {
  it("parses delete_records card", () => {
    const parsed = parsePresentActionCardArgs({
      title: "Удалить заявки?",
      actions: [
        { id: "confirm", label: "Удалить", variant: "destructive" },
        { id: "cancel", label: "Отмена", variant: "outline" },
      ],
      pendingAction: { type: "delete_records", params: { days: 30 } },
    });

    expect(parsed).not.toHaveProperty("error");
    if (!("error" in parsed)) {
      expect(parsed.pendingAction?.type).toBe("delete_records");
      expect(parsed.status).toBe("pending");
    }
  });
});

describe("classifyComposerIntent mutations", () => {
  it("routes delete records requests to data", async () => {
    await expect(classifyComposerIntent("удали старые заявки")).resolves.toBe("data");
  });
});
