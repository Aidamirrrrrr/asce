import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import type { TranscriptStep } from "@/lib/flow/simulate-flow";

export const AGENT_PHASES = [
  "plan",
  "structure",
  "wiring",
  "content",
  "validate",
  "repair",
] as const;

export type AgentPhase = (typeof AGENT_PHASES)[number];

export type PhaseStatus = "pending" | "active" | "done" | "error" | "skipped";

export type FlowAgentArchetype =
  | "booking"
  | "faq"
  | "support"
  | "quiz"
  | "subscription_gate"
  | "shop"
  | "shop_payment"
  | "lead_form"
  | "custom";

export type FlowAgentPlan = {
  archetype: FlowAgentArchetype;
  planSteps: string[];
  name?: string;
  assistantMessagePreview: string;
};

export type FlowAgentCallbacks = {
  onPhase?: (phase: AgentPhase, status: PhaseStatus, detail?: string) => void;
  onPlan?: (items: string[]) => void;
  onPartialFlow?: (flow: BotFlowDocument, nodeCount: number) => void;
  onTranscript?: (steps: TranscriptStep[]) => void;
  onValidation?: (errors: string[], warnings: string[]) => void;
  onStatus?: (message: string) => void;
};

export type FlowAgentResult = {
  flow: BotFlowDocument;
  name?: string;
  assistantMessage: string;
  stepLimitReached: boolean;
  exitReason: string;
};

export type FlowAgentMode = "create" | "refine";
