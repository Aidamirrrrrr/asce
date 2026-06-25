import { generateStructuredJson } from "@/lib/ai/ai-client";
import { buildPlannerSystemPrompt, buildRefinePlanSystemPrompt } from "@/lib/ai/flow-agent-prompts";
import type { FlowAgentArchetype, FlowAgentPlan } from "@/lib/ai/flow-agent-types";
import { buildFlowDigest } from "@/lib/ai/flow-json-generator";
import { extractJsonFromAiResponse } from "@/lib/ai/stream-json-utils";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";

const ARCHETYPES = new Set<FlowAgentArchetype>([
  "booking",
  "faq",
  "support",
  "quiz",
  "subscription_gate",
  "shop",
  "shop_payment",
  "lead_form",
  "custom",
]);

function parsePlan(raw: string): FlowAgentPlan {
  const json = extractJsonFromAiResponse(raw);
  const parsed = JSON.parse(json) as Record<string, unknown>;

  const archetypeRaw = String(parsed.archetype ?? "custom");
  const archetype: FlowAgentArchetype = ARCHETYPES.has(archetypeRaw as FlowAgentArchetype)
    ? (archetypeRaw as FlowAgentArchetype)
    : "custom";

  const planSteps = Array.isArray(parsed.planSteps)
    ? parsed.planSteps.map((item) => String(item).trim()).filter(Boolean)
    : [];

  return {
    archetype,
    planSteps: planSteps.length > 0 ? planSteps : ["Старт бота", "Основной сценарий", "Завершение"],
    name: typeof parsed.name === "string" ? parsed.name.trim() : undefined,
    assistantMessagePreview:
      typeof parsed.assistantMessagePreview === "string"
        ? parsed.assistantMessagePreview.trim()
        : "Сценарий собран.",
  };
}

export async function planFlowCreate(prompt: string): Promise<FlowAgentPlan> {
  const raw = await generateStructuredJson(buildPlannerSystemPrompt(), prompt.trim());
  return parsePlan(raw);
}

export async function planFlowRefine(
  currentFlow: BotFlowDocument,
  instruction: string,
): Promise<FlowAgentPlan> {
  const userContent =
    `Текущая схема:\n${buildFlowDigest(currentFlow)}\n\n` + `Инструкция: ${instruction.trim()}`;

  const raw = await generateStructuredJson(buildRefinePlanSystemPrompt(), userContent);
  return parsePlan(raw);
}
