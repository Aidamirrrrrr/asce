import { describe, expect, it } from "vitest";

import {
  createBuildPlanChatMessage,
  finalizeBuildPlanState,
  upsertStreamingBuildPlanMessage,
} from "@/lib/chat/build-plan-message";
import { parseChatJson, serializeChatJson } from "@/lib/projects";

describe("build plan chat messages", () => {
  it("upserts streaming build plan in message list", () => {
    const messages = upsertStreamingBuildPlanMessage([], {
      items: ["Старт", "Меню"],
      done: [0],
      nodeCount: 2,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.meta?.buildPlan?.items).toEqual(["Старт", "Меню"]);
    expect(messages[0]?.meta?.buildPlan?.done).toEqual([0]);
  });

  it("round-trips through chatJson", () => {
    const message = createBuildPlanChatMessage(
      finalizeBuildPlanState({
        items: ["A", "B"],
        done: [0, 1],
        nodeCount: 4,
        status: "active",
      }),
    );

    const parsed = parseChatJson(serializeChatJson([message]));
    expect(parsed[0]?.meta?.buildPlan?.status).toBe("complete");
    expect(parsed[0]?.meta?.buildPlan?.items).toEqual(["A", "B"]);
  });
});
