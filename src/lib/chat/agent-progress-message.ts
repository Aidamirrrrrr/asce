import type { AgentPhase, PhaseStatus } from "@/lib/ai/flow-agent-types";
import type { FlowStreamCallbacks } from "@/lib/ai/flow-generator";
import type { TranscriptStep } from "@/lib/flow/simulate-flow";
import {
  createChatMessage,
  type ProjectChatMessage,
  type ProjectChatMessageMeta,
} from "@/lib/projects";

export const STREAMING_AGENT_PROGRESS_MESSAGE_ID = "streaming-agent-progress";

export const AGENT_PROGRESS_PHASES: AgentPhase[] = [
  "plan",
  "structure",
  "wiring",
  "content",
  "validate",
  "repair",
];

export type AgentProgressPhaseState = {
  phase: AgentPhase;
  status: PhaseStatus;
  detail?: string;
};

export type AgentProgressState = {
  phases: AgentProgressPhaseState[];
  planSteps: string[];
  nodeCount: number;
  statusLabel?: string;
  transcript?: TranscriptStep[];
};

export function createInitialPhaseStates(): AgentProgressPhaseState[] {
  return AGENT_PROGRESS_PHASES.map((phase) => ({ phase, status: "pending" }));
}

export function upsertPhaseState(
  phases: AgentProgressPhaseState[],
  phase: AgentPhase,
  status: PhaseStatus,
  detail?: string,
): AgentProgressPhaseState[] {
  const next = phases.map((item) => (item.phase === phase ? { phase, status, detail } : item));
  if (!next.some((item) => item.phase === phase)) {
    next.push({ phase, status, detail });
  }
  return next;
}

export function createAgentProgressMeta(
  patch: Partial<AgentProgressState> = {},
): ProjectChatMessageMeta {
  return {
    agentProgress: {
      phases: patch.phases ?? createInitialPhaseStates(),
      planSteps: patch.planSteps ?? [],
      nodeCount: patch.nodeCount ?? 0,
      ...(patch.statusLabel ? { statusLabel: patch.statusLabel } : {}),
      ...(patch.transcript ? { transcript: patch.transcript } : {}),
    },
  };
}

export function upsertStreamingAgentProgressMessage(
  messages: ProjectChatMessage[],
  patch: Partial<AgentProgressState>,
): ProjectChatMessage[] {
  const existing = messages.find((message) => message.id === STREAMING_AGENT_PROGRESS_MESSAGE_ID);
  const current: AgentProgressState = existing?.meta?.agentProgress ?? {
    phases: createInitialPhaseStates(),
    planSteps: [],
    nodeCount: 0,
  };

  const next: AgentProgressState = {
    phases: patch.phases ?? current.phases,
    planSteps: patch.planSteps ?? current.planSteps,
    nodeCount: patch.nodeCount ?? current.nodeCount,
    statusLabel: patch.statusLabel ?? current.statusLabel,
    transcript: patch.transcript ?? current.transcript,
  };

  const message = createChatMessage(
    "assistant",
    "",
    STREAMING_AGENT_PROGRESS_MESSAGE_ID,
    createAgentProgressMeta(next),
  );

  const without = messages.filter((message) => message.id !== STREAMING_AGENT_PROGRESS_MESSAGE_ID);
  return [...without, message];
}

export function createAgentProgressCallbacks(callbacks?: FlowStreamCallbacks): FlowStreamCallbacks {
  return callbacks ?? {};
}
