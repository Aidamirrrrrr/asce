import { NextResponse } from "next/server";
import { runQueued } from "@/lib/ai/ai-queue";
import { classifyComposerIntent } from "@/lib/ai/composer-intent";
import { resolveComposerTurn } from "@/lib/ai/composer-turn";
import { FLOW_AGENT_CONTINUE_INSTRUCTION } from "@/lib/ai/flow-agent-continue";
import { flowAgentLog } from "@/lib/ai/flow-agent-log";
import {
  betaQueueMessage,
  encodeFlowGenerationSse,
  type FlowGenerationStreamEvent,
} from "@/lib/ai/flow-generation-stream";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import { runWithAiUsage } from "@/lib/billing/ai-usage-context";
import { syncFlowSecretDeclarations } from "@/lib/bot/project-secrets";
import { stopProjectBot } from "@/lib/bot/runtime-registry";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { parseFlowJson, serializeFlowJson } from "@/lib/flow/flow-schema";
import { parseChatJson, serializeChatJson, serializeProject } from "@/lib/projects";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await context.params;
  const owned = await getOwnedProject(authResult.userId, id);
  if ("error" in owned) {
    return owned.error;
  }

  const rate = await enforceRateLimit(`ai:refine:${authResult.userId}`, 60, 60 * 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов к ИИ. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
    );
  }

  const body = (await request.json()) as {
    instruction?: string;
    continueAgent?: boolean;
  };

  const continueAgent = body.continueAgent === true;
  const instruction = continueAgent ? FLOW_AGENT_CONTINUE_INSTRUCTION : body.instruction?.trim();

  if (!instruction) {
    return new Response(
      JSON.stringify({ error: continueAgent ? "Не удалось продолжить" : "Укажите инструкцию" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const existing = owned.project;

  const currentFlow = parseFlowJson(existing.flowJson, createDefaultFlow());
  const chatHistory = parseChatJson(existing.chatJson);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: FlowGenerationStreamEvent) => {
        controller.enqueue(encoder.encode(encodeFlowGenerationSse(event)));
      };

      try {
        const result = await runQueued(
          async () => {
            const intent = continueAgent
              ? "flow"
              : await runWithAiUsage({ userId: authResult.userId, kind: "intent" }, () =>
                  classifyComposerIntent(instruction, chatHistory),
                );

            send({ type: "intent", intent });
            send({
              type: "status",
              message:
                intent === "data"
                  ? "Ищу данные"
                  : intent === "chat"
                    ? "Думаю..."
                    : continueAgent
                      ? "Продолжаем сборку..."
                      : "Обновляем сценарий...",
            });
            flowAgentLog("stream refine start", {
              projectId: id,
              instructionLength: instruction.length,
              baseNodeCount: currentFlow.nodes.length,
              continueAgent,
              intent,
            });

            return runWithAiUsage(
              { userId: authResult.userId, kind: intent === "flow" ? "flow_refine" : "data_qa" },
              () =>
                resolveComposerTurn({
                  projectId: id,
                  userMessage: instruction,
                  chatHistory,
                  currentFlow,
                  recordUserMessage: !continueAgent,
                  forceFlow: continueAgent,
                  intent,
                  callbacks:
                    intent === "flow"
                      ? {
                          onPartialFlow: (flow, nodeCount) => {
                            send({ type: "flow", flow, nodeCount });
                          },
                          onPlan: (items) => {
                            send({ type: "plan", items });
                          },
                          onPlanProgress: (done) => {
                            send({ type: "plan_progress", done });
                          },
                        }
                      : undefined,
                }),
            );
          },
          {
            onQueued: (position) =>
              send({ type: "queue", position, message: betaQueueMessage(position) }),
          },
        );

        if (result.kind === "data") {
          const project = await db.project.update({
            where: { id },
            data: { chatJson: serializeChatJson(result.messages) },
          });

          send({
            type: "complete",
            project: serializeProject(project),
            assistantMessage: result.assistantMessage,
            messages: result.messages,
            flowUpdated: false,
          });
          flowAgentLog("stream refine complete (data)", { projectId: id });
          return;
        }

        if (existing.runtimeStatus === "running") {
          await stopProjectBot(existing);
        }

        const project = await db.project.update({
          where: { id },
          data: {
            flowJson: serializeFlowJson(result.flow),
            chatJson: serializeChatJson(result.messages),
            ...(existing.runtimeStatus === "running"
              ? { runtimeStatus: "stopped", status: "draft" }
              : {}),
          },
        });

        await syncFlowSecretDeclarations(id, result.flow.secrets ?? []);

        send({
          type: "complete",
          project: serializeProject(project),
          assistantMessage: result.assistantMessage,
          messages: result.messages,
          flow: result.flow,
          flowUpdated: true,
          validationSummary: result.validationSummary,
          stepLimitReached: result.stepLimitReached,
        });
        flowAgentLog("stream refine complete", {
          projectId: id,
          nodeCount: result.flow.nodes.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось обновить сценарий";
        flowAgentLog("stream refine error", { projectId: id, message });
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
