import type { FlowGenerationStreamEvent } from "@/lib/ai/flow-generation-stream";
import type { FlowStreamCallbacks } from "@/lib/ai/flow-generator";

export function buildAgentStreamCallbacks(
  send: (event: FlowGenerationStreamEvent) => void,
): FlowStreamCallbacks {
  return {
    onStatus: (message) => send({ type: "status", message }),
    onPlan: (items) => send({ type: "plan", items }),
    onPhase: (phase, status, detail) => send({ type: "phase", phase, status, detail }),
    onPartialFlow: (flow, nodeCount) => send({ type: "flow", flow, nodeCount }),
    onTranscript: (steps) => send({ type: "transcript", steps }),
    onValidation: (errors, warnings) => send({ type: "validation", errors, warnings }),
  };
}
