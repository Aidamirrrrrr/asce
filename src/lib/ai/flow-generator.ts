import { runFlowAgentCreate, runFlowAgentRefine } from "@/lib/ai/flow-agent";
import type { AgentPhase, FlowAgentCallbacks, PhaseStatus } from "@/lib/ai/flow-agent-types";
import { buildLlmServiceErrorMessage, isLlmServiceError } from "@/lib/ai/llm-retry";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import type { TranscriptStep } from "@/lib/flow/simulate-flow";
import type { ProjectChatMessage } from "@/lib/projects";

export type FlowStreamCallbacks = FlowAgentCallbacks & {
  /** @deprecated Используйте onPhase */
  onPlanProgress?: (done: number[]) => void;
};

export type FlowGenerationResult = {
  flow: BotFlowDocument;
  name?: string;
  assistantMessage: string;
  stepLimitReached?: boolean;
  exitReason?: string;
  transcript?: TranscriptStep[];
};

function toAgentCallbacks(callbacks?: FlowStreamCallbacks): FlowAgentCallbacks | undefined {
  if (!callbacks) {
    return undefined;
  }
  return {
    onPhase: callbacks.onPhase,
    onPlan: callbacks.onPlan,
    onPartialFlow: callbacks.onPartialFlow,
    onTranscript: callbacks.onTranscript,
    onValidation: callbacks.onValidation,
    onStatus: callbacks.onStatus,
  };
}

export async function generateFlowFromPrompt(
  prompt: string,
  callbacks?: FlowStreamCallbacks,
  projectId?: string,
): Promise<FlowGenerationResult> {
  const trimmed = prompt.trim();

  try {
    const result = await runFlowAgentCreate({
      prompt: trimmed,
      projectId,
      callbacks: toAgentCallbacks(callbacks),
    });

    return {
      flow: result.flow,
      name: result.name,
      assistantMessage: result.assistantMessage,
      stepLimitReached: result.stepLimitReached,
      exitReason: result.exitReason,
    };
  } catch (error) {
    if (isLlmServiceError(error)) {
      throw new Error(buildLlmServiceErrorMessage(error));
    }
    throw error;
  }
}

export async function refineFlowFromInstruction({
  currentFlow,
  instruction,
  chatHistory = [],
  callbacks,
  projectId,
}: {
  currentFlow: BotFlowDocument;
  instruction: string;
  chatHistory?: ProjectChatMessage[];
  callbacks?: FlowStreamCallbacks;
  projectId?: string;
}): Promise<FlowGenerationResult> {
  const trimmed = instruction.trim();

  try {
    const result = await runFlowAgentRefine({
      currentFlow,
      instruction: trimmed,
      chatHistory,
      projectId,
      callbacks: toAgentCallbacks(callbacks),
    });

    return {
      flow: result.flow,
      assistantMessage: result.assistantMessage,
      stepLimitReached: result.stepLimitReached,
      exitReason: result.exitReason,
    };
  } catch (error) {
    if (isLlmServiceError(error)) {
      throw new Error(buildLlmServiceErrorMessage(error));
    }
    throw error;
  }
}

export type { AgentPhase, PhaseStatus };
