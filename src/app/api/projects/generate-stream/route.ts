import { runQueued } from "@/lib/ai/ai-queue";
import { resolveCreateComposerTurn } from "@/lib/ai/composer-turn";
import { flowAgentLog } from "@/lib/ai/flow-agent-log";
import {
  betaQueueMessage,
  encodeFlowGenerationSse,
  type FlowGenerationStreamEvent,
} from "@/lib/ai/flow-generation-stream";
import { requireUser } from "@/lib/auth/session";
import { runWithAiUsage } from "@/lib/billing/ai-usage-context";
import { getDefaultDeliveryMode } from "@/lib/bot/config";
import { syncFlowSecretDeclarations } from "@/lib/bot/project-secrets";
import { generateWebhookSecret } from "@/lib/bot/webhook-secret";
import { db } from "@/lib/db";
import { createStreamingSeedFlow } from "@/lib/flow/default-flow";
import { serializeFlowJson } from "@/lib/flow/flow-schema";
import { projectNameFromPrompt, serializeChatJson, serializeProject } from "@/lib/projects";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

const STREAMING_SEED_FLOW_JSON = serializeFlowJson(createStreamingSeedFlow());

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  const rate = await enforceRateLimit(`ai:generate:${authResult.userId}`, 30, 60 * 60);
  if (!rate.allowed) {
    return Response.json(
      { error: "Слишком много запросов к ИИ. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
    );
  }

  const body = (await request.json()) as { prompt?: string };
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return new Response(JSON.stringify({ error: "Укажите промпт" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: FlowGenerationStreamEvent) => {
        controller.enqueue(encoder.encode(encodeFlowGenerationSse(event)));
      };

      let projectId: string | null = null;

      try {
        const draftProject = await db.project.create({
          data: {
            userId: authResult.userId,
            name: projectNameFromPrompt(prompt),
            description: prompt,
            prompt,
            status: "draft",
            flowJson: STREAMING_SEED_FLOW_JSON,
            chatJson: serializeChatJson([]),
            webhookSecret: generateWebhookSecret(),
            deliveryMode: getDefaultDeliveryMode(),
          },
        });

        projectId = draftProject.id;
        send({ type: "started", project: serializeProject(draftProject) });
        send({ type: "status", message: "Генерируем сценарий..." });
        flowAgentLog("stream create start", {
          projectId: draftProject.id,
          promptLength: prompt.length,
        });

        const result = await runWithAiUsage(
          { userId: authResult.userId, kind: "flow_generate" },
          () =>
            runQueued(
              () =>
                resolveCreateComposerTurn({
                  prompt,
                  projectId: draftProject.id,
                  callbacks: {
                    onPartialFlow: (flow, nodeCount) => {
                      send({ type: "flow", flow, nodeCount });
                    },
                    onPlan: (items) => {
                      send({ type: "plan", items });
                    },
                    onPlanProgress: (done) => {
                      send({ type: "plan_progress", done });
                    },
                  },
                }),
              {
                onQueued: (position) =>
                  send({ type: "queue", position, message: betaQueueMessage(position) }),
                onStart: () => send({ type: "status", message: "Генерируем сценарий..." }),
              },
            ),
        );

        const project = await db.project.update({
          where: { id: draftProject.id },
          data: {
            name: result.name?.trim() || projectNameFromPrompt(prompt),
            flowJson: serializeFlowJson(result.flow),
            chatJson: serializeChatJson(result.messages),
          },
        });

        await syncFlowSecretDeclarations(project.id, result.flow.secrets ?? []);

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
        flowAgentLog("stream create complete", {
          projectId: project.id,
          nodeCount: result.flow.nodes.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось создать проект";
        flowAgentLog("stream create error", { projectId, message });

        if (projectId) {
          await db.project.delete({ where: { id: projectId } }).catch(() => undefined);
        }

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
