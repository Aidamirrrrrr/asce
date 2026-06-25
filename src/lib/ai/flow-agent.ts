import { flowAgentLog } from "@/lib/ai/flow-agent-log";
import { planFlowCreate, planFlowRefine } from "@/lib/ai/flow-agent-planner";
import {
  buildContentSystemPrompt,
  buildRefineEditSystemPrompt,
  buildStructureSystemPrompt,
  buildWiringSystemPrompt,
} from "@/lib/ai/flow-agent-prompts";
import { createFlowAgentTelemetry } from "@/lib/ai/flow-agent-telemetry";
import { runAgentToolPhase } from "@/lib/ai/flow-agent-tool-loop";
import {
  CONTENT_TOOLS,
  REFINE_EDIT_TOOLS,
  STRUCTURE_TOOLS,
  WIRING_TOOLS,
} from "@/lib/ai/flow-agent-tools";
import type {
  AgentPhase,
  FlowAgentCallbacks,
  FlowAgentResult,
  PhaseStatus,
} from "@/lib/ai/flow-agent-types";
import { repairFlowStructure } from "@/lib/ai/flow-repair";
import { buildLlmServiceErrorMessage, isLlmServiceError } from "@/lib/ai/llm-retry";
import { createEmptyFlow } from "@/lib/flow/default-flow";
import { deterministicRepair } from "@/lib/flow/deterministic-repair";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { applyLayoutToFlowDocument } from "@/lib/flow/normalize-generated-flow";
import { type SimulationIssue, simulateFlow } from "@/lib/flow/simulate-flow";
import { type FlowValidationIssue, validateFlowDocument } from "@/lib/flow/validate-flow-document";
import type { ProjectChatMessage } from "@/lib/projects";

/** Максимум tool-вызовов агента за один запуск (create: сумма бюджетов фаз). */
export const FLOW_AGENT_MAX_STEPS = 120;

/** Скрытая инструкция для кнопки «Продолжить сборку». */
export const FLOW_AGENT_CONTINUE_INSTRUCTION =
  "Продолжи сборку сценария с текущего состояния на холсте. " +
  "Доделай недостающие узлы, связи и тексты по плану пользователя.";

export function buildStepLimitNotice(): string {
  return `Достигнут лимит шагов агента (${FLOW_AGENT_MAX_STEPS}). Схема собрана частично — можно продолжить сборку.`;
}

const STRUCTURE_STEP_BUDGET = 60;
const WIRING_STEP_BUDGET = 30;
const CONTENT_STEP_BUDGET = 30;
const REFINE_EDIT_STEP_BUDGET = 80;
const MAX_REPAIR_ROUNDS = 2;

function emitPhase(
  callbacks: FlowAgentCallbacks | undefined,
  phase: AgentPhase,
  status: PhaseStatus,
  detail?: string,
): void {
  callbacks?.onPhase?.(phase, status, detail);
}

function simulationToValidation(issues: SimulationIssue[]): FlowValidationIssue[] {
  return issues.map((issue) => ({
    severity: issue.severity,
    message: issue.message,
    nodeLabel: issue.nodeLabel,
  }));
}

function collectRepairIssues(flow: BotFlowDocument): FlowValidationIssue[] {
  const validation = validateFlowDocument(flow);
  const simulation = simulationToValidation(simulateFlow(flow).issues);
  const combined = [...validation, ...simulation];
  const seen = new Set<string>();
  return combined.filter((issue) => {
    const key = `${issue.severity}:${issue.nodeLabel ?? ""}:${issue.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return issue.severity === "error";
  });
}

function splitValidation(flow: BotFlowDocument): {
  errors: string[];
  warnings: string[];
  transcript: ReturnType<typeof simulateFlow>["transcript"];
} {
  const validation = validateFlowDocument(flow);
  const simulation = simulateFlow(flow);
  const errors = [
    ...validation.filter((i) => i.severity === "error").map((i) => i.message),
    ...simulation.issues.filter((i) => i.severity === "error").map((i) => i.message),
  ];
  const warnings = [
    ...validation.filter((i) => i.severity === "warning").map((i) => i.message),
    ...simulation.issues.filter((i) => i.severity === "warning").map((i) => i.message),
  ];
  return { errors, warnings, transcript: simulation.transcript };
}

async function validateAndRepair(
  flow: BotFlowDocument,
  callbacks: FlowAgentCallbacks | undefined,
): Promise<BotFlowDocument> {
  emitPhase(callbacks, "validate", "active");
  let current = deterministicRepair(flow).doc;
  current = applyLayoutToFlowDocument(current);

  for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
    const issues = collectRepairIssues(current);
    const { errors, warnings, transcript } = splitValidation(current);
    callbacks?.onValidation?.(errors, warnings);
    callbacks?.onTranscript?.(transcript);
    callbacks?.onPartialFlow?.(current, current.nodes.length);

    if (issues.length === 0) {
      emitPhase(callbacks, "validate", "done");
      emitPhase(callbacks, "repair", "skipped");
      return current;
    }

    if (round === 0) {
      emitPhase(callbacks, "validate", "done", `${issues.length} проблем`);
    }

    emitPhase(callbacks, "repair", "active", `раунд ${round + 1}`);
    callbacks?.onStatus?.("Исправляю схему…");

    current = await repairFlowStructure(current, issues);
    current = applyLayoutToFlowDocument(current);
    callbacks?.onPartialFlow?.(current, current.nodes.length);
  }

  const finalIssues = collectRepairIssues(current);
  emitPhase(callbacks, "repair", finalIssues.length > 0 ? "error" : "done");
  emitPhase(callbacks, "validate", "done");
  return current;
}

function buildPlanUserMessage(prompt: string, planSteps: string[]): string {
  return `Задача пользователя:\n${prompt}\n\nПлан сценария:\n${planSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

function notifyFlow(callbacks: FlowAgentCallbacks | undefined, flow: BotFlowDocument): void {
  callbacks?.onPartialFlow?.(flow, flow.nodes.length);
}

export async function runFlowAgentCreate(input: {
  prompt: string;
  projectId?: string;
  callbacks?: FlowAgentCallbacks;
}): Promise<FlowAgentResult> {
  const startedAt = Date.now();
  let totalSteps = 0;
  let stepLimitReached = false;
  let exitReason = "finished";

  const telemetry = await createFlowAgentTelemetry({
    projectId: input.projectId,
    mode: "create",
    instruction: input.prompt,
    nodeCountStart: 0,
  });

  try {
    emitPhase(input.callbacks, "plan", "active");
    input.callbacks?.onStatus?.("Определяю тип бота…");
    const plan = await planFlowCreate(input.prompt);
    input.callbacks?.onPlan?.(plan.planSteps);
    emitPhase(input.callbacks, "plan", "done");

    let flow: BotFlowDocument = createEmptyFlow();
    notifyFlow(input.callbacks, flow);

    const planMessage = buildPlanUserMessage(input.prompt, plan.planSteps);

    emitPhase(input.callbacks, "structure", "active");
    input.callbacks?.onStatus?.("Создаю блоки…");
    const structure = await runAgentToolPhase({
      systemPrompt: buildStructureSystemPrompt(plan.archetype),
      userMessage: planMessage,
      tools: STRUCTURE_TOOLS,
      doc: flow,
      maxSteps: STRUCTURE_STEP_BUDGET,
      globalStepOffset: totalSteps,
      telemetry,
      onDocChange: (doc) => notifyFlow(input.callbacks, doc),
    });
    flow = structure.doc;
    totalSteps += structure.stepsUsed;
    emitPhase(input.callbacks, "structure", "done", `${flow.nodes.length} узлов`);

    emitPhase(input.callbacks, "wiring", "active");
    input.callbacks?.onStatus?.("Соединяю кнопки и ветки…");
    const wiring = await runAgentToolPhase({
      systemPrompt: buildWiringSystemPrompt(),
      userMessage: `${planMessage}\n\nСоедини все узлы. Сначала list_nodes.`,
      tools: WIRING_TOOLS,
      doc: flow,
      maxSteps: WIRING_STEP_BUDGET,
      globalStepOffset: totalSteps,
      telemetry,
      onDocChange: (doc) => notifyFlow(input.callbacks, doc),
    });
    flow = wiring.doc;
    totalSteps += wiring.stepsUsed;
    emitPhase(input.callbacks, "wiring", "done");

    emitPhase(input.callbacks, "content", "active");
    input.callbacks?.onStatus?.("Пишу тексты…");
    const content = await runAgentToolPhase({
      systemPrompt: buildContentSystemPrompt(),
      userMessage: `${planMessage}\n\nЗаполни тексты и данные всех узлов.`,
      tools: CONTENT_TOOLS,
      doc: flow,
      maxSteps: CONTENT_STEP_BUDGET,
      globalStepOffset: totalSteps,
      telemetry,
      onDocChange: (doc) => notifyFlow(input.callbacks, doc),
    });
    flow = content.doc;
    totalSteps += content.stepsUsed;
    emitPhase(input.callbacks, "content", "done");

    stepLimitReached = totalSteps >= FLOW_AGENT_MAX_STEPS;

    flow = await validateAndRepair(flow, input.callbacks);

    if (stepLimitReached) {
      exitReason = "max_steps_reached";
    }

    await telemetry.finish({
      exitReason,
      totalSteps,
      nodeCountEnd: flow.nodes.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      flow,
      name: plan.name,
      assistantMessage: plan.assistantMessagePreview,
      stepLimitReached,
      exitReason,
    };
  } catch (error) {
    exitReason = isLlmServiceError(error) ? "llm_service_error" : "agent_error";
    await telemetry.finish({
      exitReason,
      totalSteps,
      nodeCountEnd: 0,
      durationMs: Date.now() - startedAt,
    });
    if (isLlmServiceError(error)) {
      throw new Error(buildLlmServiceErrorMessage(error));
    }
    throw error;
  }
}

export async function runFlowAgentRefine(input: {
  currentFlow: BotFlowDocument;
  instruction: string;
  chatHistory?: ProjectChatMessage[];
  projectId?: string;
  callbacks?: FlowAgentCallbacks;
}): Promise<FlowAgentResult> {
  const startedAt = Date.now();
  let totalSteps = 0;
  let stepLimitReached = false;
  let exitReason = "finished";

  const telemetry = await createFlowAgentTelemetry({
    projectId: input.projectId,
    mode: "refine",
    instruction: input.instruction,
    nodeCountStart: input.currentFlow.nodes.length,
  });

  try {
    emitPhase(input.callbacks, "plan", "active");
    input.callbacks?.onStatus?.("Планирую правки…");
    const plan = await planFlowRefine(input.currentFlow, input.instruction);
    input.callbacks?.onPlan?.(plan.planSteps);
    emitPhase(input.callbacks, "plan", "done");

    const historySnippet = (input.chatHistory ?? [])
      .slice(-4)
      .map((m) => `${m.role === "user" ? "Пользователь" : "Ассистент"}: ${m.content.slice(0, 200)}`)
      .join("\n");

    const editMessage =
      `Инструкция: ${input.instruction}\n\n` +
      `План правок:\n${plan.planSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` +
      (historySnippet ? `История:\n${historySnippet}\n\n` : "") +
      "Внеси изменения в схему. Сначала list_nodes.";

    emitPhase(input.callbacks, "structure", "active");
    input.callbacks?.onStatus?.("Обновляю схему…");
    const edit = await runAgentToolPhase({
      systemPrompt: buildRefineEditSystemPrompt(),
      userMessage: editMessage,
      tools: REFINE_EDIT_TOOLS,
      doc: input.currentFlow,
      maxSteps: REFINE_EDIT_STEP_BUDGET,
      globalStepOffset: totalSteps,
      telemetry,
      onDocChange: (doc) => notifyFlow(input.callbacks, doc),
    });

    let flow = edit.doc;
    totalSteps += edit.stepsUsed;
    emitPhase(input.callbacks, "structure", "done");
    emitPhase(input.callbacks, "wiring", "skipped");
    emitPhase(input.callbacks, "content", "skipped");

    stepLimitReached = totalSteps >= REFINE_EDIT_STEP_BUDGET;

    flow = await validateAndRepair(flow, input.callbacks);

    if (stepLimitReached) {
      exitReason = "max_steps_reached";
    }

    await telemetry.finish({
      exitReason,
      totalSteps,
      nodeCountEnd: flow.nodes.length,
      durationMs: Date.now() - startedAt,
    });

    flowAgentLog("agent refine done", {
      projectId: input.projectId,
      nodeCount: flow.nodes.length,
      totalSteps,
    });

    return {
      flow,
      assistantMessage: plan.assistantMessagePreview,
      stepLimitReached,
      exitReason,
    };
  } catch (error) {
    exitReason = isLlmServiceError(error) ? "llm_service_error" : "agent_error";
    await telemetry.finish({
      exitReason,
      totalSteps,
      nodeCountEnd: input.currentFlow.nodes.length,
      durationMs: Date.now() - startedAt,
    });
    if (isLlmServiceError(error)) {
      throw new Error(buildLlmServiceErrorMessage(error));
    }
    throw error;
  }
}
