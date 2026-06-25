import { describe, expect, it } from "vitest";
import { createInitialPhaseStates, upsertPhaseState } from "@/lib/chat/agent-progress-message";
import { createEmptyFlow } from "@/lib/flow/default-flow";
import { deterministicRepair } from "@/lib/flow/deterministic-repair";
import { simulateFlow } from "@/lib/flow/simulate-flow";
import { validateFlowDocument } from "@/lib/flow/validate-flow-document";

describe("agent progress helpers", () => {
  it("upserts phase state", () => {
    const initial = createInitialPhaseStates();
    const next = upsertPhaseState(initial, "plan", "done", "ok");
    expect(next.find((phase) => phase.phase === "plan")?.status).toBe("done");
    expect(next.find((phase) => phase.phase === "structure")?.status).toBe("pending");
  });
});

describe("validate + simulate pipeline", () => {
  it("validate and simulate run on empty flow without throwing", () => {
    const flow = createEmptyFlow();
    expect(() => validateFlowDocument(flow)).not.toThrow();
    expect(() => simulateFlow(flow)).not.toThrow();
  });

  it("deterministic repair keeps valid empty flow stable", () => {
    const flow = createEmptyFlow();
    const repaired = deterministicRepair(flow);
    expect(repaired.changed).toBe(false);
  });
});
