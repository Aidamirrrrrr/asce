import { getOwnedProject, requireUser } from "@/lib/auth/session";
import { resolveChatAction } from "@/lib/chat/resolve-chat-action";
import { serializeProject } from "@/lib/projects";

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

  const body = (await request.json()) as { messageId?: string; actionId?: string };
  const messageId = body.messageId?.trim();
  const actionId = body.actionId?.trim();

  if (!(messageId && actionId)) {
    return Response.json({ error: "Укажите messageId и actionId" }, { status: 400 });
  }

  const project = owned.project;

  try {
    const result = await resolveChatAction({ projectId: id, messageId, actionId });
    return Response.json({
      project: serializeProject(project),
      messages: result.messages,
      assistantMessage: result.assistantMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить действие";
    return Response.json({ error: message }, { status: 400 });
  }
}
