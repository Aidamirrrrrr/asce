import { NextResponse } from "next/server";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import { startProjectBot } from "@/lib/bot/runtime-registry";
import { ensureProjectWebhookSecret } from "@/lib/bot/webhook-secret";
import { db } from "@/lib/db";
import { resolveWebhookConfig, serializeProject } from "@/lib/projects";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
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
    await startProjectBot(readyProject);

    const updated = await db.project.findUniqueOrThrow({ where: { id } });
    const webhook = resolveWebhookConfig(updated);

    return NextResponse.json({
      project: serializeProject(updated),
      ...(updated.deliveryMode === "webhook" ? { webhookUrl: webhook.webhookUrl } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось запустить бота";

    try {
      const { id } = await context.params;
      await db.project.update({
        where: { id },
        data: { runtimeStatus: "error", lastError: message },
      });
    } catch {
      // Project may not exist.
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
