import { NextResponse } from "next/server";

import { resolveRollbackState } from "@/lib/chat/chat-rollback";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import { syncFlowSecretDeclarations } from "@/lib/bot/project-secrets";
import { db } from "@/lib/db";
import { createDefaultFlow } from "@/lib/flow/default-flow";
import { parseFlowJson, serializeFlowJson } from "@/lib/flow/flow-schema";
import { parseChatJson, serializeChatJson, serializeProject } from "@/lib/projects";

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

  const body = (await request.json()) as { messageId?: string };
  const messageId = body.messageId?.trim();
  if (!messageId) {
    return NextResponse.json({ error: "Укажите сообщение" }, { status: 400 });
  }

  const messages = parseChatJson(owned.project.chatJson);
  const fallbackFlow = parseFlowJson(owned.project.flowJson, createDefaultFlow());
  const rollback = resolveRollbackState(messages, messageId, fallbackFlow);

  if (!rollback) {
    return NextResponse.json({ error: "Не удалось откатить чат" }, { status: 400 });
  }

  const project = await db.project.update({
    where: { id },
    data: {
      chatJson: serializeChatJson(rollback.messages),
      flowJson: serializeFlowJson(rollback.flow),
    },
  });

  await syncFlowSecretDeclarations(id, rollback.flow.secrets ?? []);

  return NextResponse.json({
    project: serializeProject(project),
    messages: rollback.messages,
    flow: rollback.flow,
  });
}
