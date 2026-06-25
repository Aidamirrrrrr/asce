import { describe, expect, it } from "vitest";

import {
  canRollbackToMessage,
  resolveFlowSnapshotAtIndex,
  resolveRollbackState,
} from "@/lib/chat/chat-rollback";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { createChatMessage } from "@/lib/projects";

describe("chat rollback", () => {
  const flowA = { ...createDefaultFlow(), name: "A" };
  const flowB = { ...createDefaultFlow(), name: "B" };

  const messages = [
    createChatMessage("user", "Собери бота"),
    createChatMessage("assistant", "Готово", undefined, { flowSnapshot: flowA }),
    createChatMessage("user", "Добавь меню"),
    createChatMessage("assistant", "Меню добавлено", undefined, { flowSnapshot: flowB }),
  ];

  it("detects rollback availability", () => {
    expect(canRollbackToMessage(messages, messages[0]?.id ?? "")).toBe(true);
    expect(canRollbackToMessage(messages, messages[3]?.id ?? "")).toBe(false);
  });

  it("restores flow snapshot for assistant target", () => {
    const state = resolveRollbackState(messages, messages[3]?.id ?? "");
    expect(state?.messages).toHaveLength(4);
    expect(state?.flow.name).toBe("B");
  });

  it("restores flow snapshot stored on user message", () => {
    const messagesWithUserSnapshot = [
      createChatMessage("user", "Собери бота", undefined, { flowSnapshot: flowA }),
      createChatMessage("assistant", "Готово", undefined, { flowSnapshot: flowB }),
      createChatMessage("user", "Добавь меню", undefined, { flowSnapshot: flowB }),
      createChatMessage("assistant", "Меню добавлено", undefined, {
        flowSnapshot: { ...flowB, name: "C" },
      }),
    ];

    const state = resolveRollbackState(
      messagesWithUserSnapshot,
      messagesWithUserSnapshot[2]?.id ?? "",
    );
    expect(state?.messages).toHaveLength(3);
    expect(state?.flow.name).toBe("B");
  });

  it("restores previous flow snapshot for user target", () => {
    const state = resolveRollbackState(messages, messages[2]?.id ?? "");
    expect(state?.messages).toHaveLength(3);
    expect(state?.flow.name).toBe("A");
  });

  it("finds nearest snapshot walking backwards", () => {
    expect(resolveFlowSnapshotAtIndex(messages, 2)?.name).toBe("A");
  });
});
