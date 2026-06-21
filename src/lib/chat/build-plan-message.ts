import type { FlowStreamCallbacks } from "@/lib/ai/flow-generator";
import {
  createChatMessage,
  type ProjectChatMessage,
  type ProjectChatMessageMeta,
} from "@/lib/projects";

export const STREAMING_BUILD_PLAN_MESSAGE_ID = "streaming-build-plan";

export type ChatBuildPlanState = {
  items: string[];
  done: number[];
  nodeCount: number;
  status: "active" | "complete";
  statusLabel?: string;
};

export function buildBuildPlanFallbackText(state: ChatBuildPlanState): string {
  if (state.items.length === 0) {
    return state.statusLabel?.trim() || "Собираю сценарий…";
  }

  const lines = state.items.map((item, index) => {
    const mark = state.done.includes(index) ? "x" : " ";
    return `- [${mark}] ${item}`;
  });

  return `Сборка сценария:\n${lines.join("\n")}`;
}

export function buildBuildPlanMeta(state: ChatBuildPlanState): ProjectChatMessageMeta {
  return { buildPlan: state };
}

export function createBuildPlanChatMessage(
  state: ChatBuildPlanState,
  id = `build-plan-${crypto.randomUUID()}`,
): ProjectChatMessage {
  return createChatMessage(
    "assistant",
    buildBuildPlanFallbackText(state),
    id,
    buildBuildPlanMeta(state),
  );
}

export function createStreamingBuildPlanMessage(state: ChatBuildPlanState): ProjectChatMessage {
  return createBuildPlanChatMessage(state, STREAMING_BUILD_PLAN_MESSAGE_ID);
}

export function upsertStreamingBuildPlanMessage(
  messages: ProjectChatMessage[],
  update: Partial<ChatBuildPlanState>,
): ProjectChatMessage[] {
  const existing = messages.find((message) => message.id === STREAMING_BUILD_PLAN_MESSAGE_ID);
  const previous = existing?.meta?.buildPlan;
  const nextState: ChatBuildPlanState = {
    items: update.items ?? previous?.items ?? [],
    done: update.done ?? previous?.done ?? [],
    nodeCount: update.nodeCount ?? previous?.nodeCount ?? 0,
    status: update.status ?? previous?.status ?? "active",
    statusLabel: update.statusLabel ?? previous?.statusLabel,
  };

  const nextMessage = createStreamingBuildPlanMessage(nextState);
  if (existing) {
    return messages.map((message) =>
      message.id === STREAMING_BUILD_PLAN_MESSAGE_ID ? nextMessage : message,
    );
  }

  return [...messages, nextMessage];
}

export function finalizeBuildPlanState(state: ChatBuildPlanState): ChatBuildPlanState {
  return {
    ...state,
    status: "complete",
    statusLabel: undefined,
    done: state.items.map((_, index) => index),
  };
}

export function createBuildPlanCollectingCallbacks(callbacks?: FlowStreamCallbacks): {
  callbacks: FlowStreamCallbacks;
  getCollectedBuildPlan: () => ChatBuildPlanState | null;
} {
  let plan: ChatBuildPlanState | null = null;

  return {
    callbacks: {
      ...callbacks,
      onPlan: (items) => {
        plan = { items, done: [], nodeCount: 0, status: "active" };
        callbacks?.onPlan?.(items);
      },
      onPlanProgress: (done) => {
        if (plan) {
          plan = { ...plan, done };
        }
        callbacks?.onPlanProgress?.(done);
      },
      onPartialFlow: (flow, nodeCount) => {
        if (plan) {
          plan = { ...plan, nodeCount };
        }
        callbacks?.onPartialFlow?.(flow, nodeCount);
      },
    },
    getCollectedBuildPlan: () =>
      plan && plan.items.length > 0 ? finalizeBuildPlanState(plan) : null,
  };
}
