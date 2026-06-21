import { NextResponse } from "next/server";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import { isDeliveryMode } from "@/lib/bot/config";
import { syncFlowSecretDeclarations } from "@/lib/bot/project-secrets";
import { encryptBotTokenForStorage } from "@/lib/bot/project-token";
import { stopProjectBot } from "@/lib/bot/runtime-registry";
import { ensureProjectWebhookSecret } from "@/lib/bot/webhook-secret";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { parseFlowJson, serializeFlowJson } from "@/lib/flow/flow-schema";
import { applyInferredSecretsToFlow } from "@/lib/flow/secret-recipes";
import { serializeProject, serializeProjectDetail } from "@/lib/projects";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const { id } = await context.params;
    const owned = await getOwnedProject(authResult.userId, id);
    if ("error" in owned) {
      return owned.error;
    }

    const readyProject = await ensureProjectWebhookSecret(owned.project);

    return NextResponse.json({
      project: serializeProjectDetail(readyProject),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить проект" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const { id } = await context.params;
    const owned = await getOwnedProject(authResult.userId, id);
    if ("error" in owned) {
      return owned.error;
    }

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      status?: string;
      flowJson?: string | null;
      botToken?: string | null;
      deliveryMode?: string;
    };

    const existing = owned.project;

    if (body.deliveryMode !== undefined && !isDeliveryMode(body.deliveryMode)) {
      return NextResponse.json({ error: "Недопустимый режим доставки" }, { status: 400 });
    }

    const isRuntimeChange =
      body.botToken !== undefined || body.deliveryMode !== undefined || body.flowJson !== undefined;

    if (isRuntimeChange && existing.runtimeStatus === "running") {
      await stopProjectBot(existing);
    }

    const enrichedFlow =
      body.flowJson !== undefined
        ? applyInferredSecretsToFlow(parseFlowJson(body.flowJson, createDefaultFlow()))
        : null;

    const project = await db.project.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(enrichedFlow ? { flowJson: serializeFlowJson(enrichedFlow) } : {}),
        ...(body.botToken !== undefined
          ? { botToken: encryptBotTokenForStorage(body.botToken?.trim() || null) }
          : {}),
        ...(body.deliveryMode !== undefined ? { deliveryMode: body.deliveryMode } : {}),
        ...(isRuntimeChange && existing.runtimeStatus === "running"
          ? { runtimeStatus: "stopped", status: "draft" }
          : {}),
      },
    });

    if (enrichedFlow) {
      await syncFlowSecretDeclarations(id, enrichedFlow.secrets ?? []);
    }

    return NextResponse.json({ project: serializeProject(project) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обновить проект" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const { id } = await context.params;
    const owned = await getOwnedProject(authResult.userId, id);
    if ("error" in owned) {
      return owned.error;
    }

    const existing = owned.project;

    if (existing.runtimeStatus === "running") {
      await stopProjectBot(existing);
    }

    await db.project.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось удалить проект" },
      { status: 500 },
    );
  }
}
