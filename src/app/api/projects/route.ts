import { NextResponse } from "next/server";

import { generateFlowFromPrompt } from "@/lib/ai/flow-generator";
import { requireUser } from "@/lib/auth/session";
import { getDefaultDeliveryMode } from "@/lib/bot/config";
import { syncFlowSecretDeclarations } from "@/lib/bot/project-secrets";
import { generateWebhookSecret } from "@/lib/bot/webhook-secret";
import { db } from "@/lib/db";
import { serializeFlowJson } from "@/lib/flow/flow-schema";
import {
  createChatMessage,
  projectNameFromPrompt,
  serializeChatJson,
  serializeProject,
} from "@/lib/projects";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

export async function GET() {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const projects = await db.project.findMany({
      where: { userId: authResult.userId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      projects: projects.map(serializeProject),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить проекты" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const rate = await enforceRateLimit(`ai:create:${authResult.userId}`, 20, 60 * 60);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов к ИИ. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }

    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: "Укажите промпт" }, { status: 400 });
    }

    let generation: Awaited<ReturnType<typeof generateFlowFromPrompt>>;
    try {
      generation = await generateFlowFromPrompt(prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сгенерировать сценарий";
      const status = message.includes("AI_API_KEY") ? 503 : 502;
      return NextResponse.json({ error: message }, { status });
    }

    const chatMessages = [
      createChatMessage("user", prompt),
      createChatMessage("assistant", generation.assistantMessage),
    ];

    const project = await db.project.create({
      data: {
        userId: authResult.userId,
        name: generation.name?.trim() || projectNameFromPrompt(prompt),
        description: prompt,
        prompt,
        status: "draft",
        flowJson: serializeFlowJson(generation.flow),
        chatJson: serializeChatJson(chatMessages),
        webhookSecret: generateWebhookSecret(),
        deliveryMode: getDefaultDeliveryMode(),
      },
    });

    await syncFlowSecretDeclarations(project.id, generation.flow.secrets ?? []);

    return NextResponse.json({ project: serializeProject(project) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось создать проект" },
      { status: 500 },
    );
  }
}
