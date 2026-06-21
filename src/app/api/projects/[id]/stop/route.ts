import { NextResponse } from "next/server";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import { markProjectStopped, stopProjectBot } from "@/lib/bot/runtime-registry";
import { db } from "@/lib/db";
import { serializeProject } from "@/lib/projects";

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

    await stopProjectBot(owned.project);
    await markProjectStopped(id);

    const updated = await db.project.findUniqueOrThrow({ where: { id } });
    return NextResponse.json({ project: serializeProject(updated) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось остановить бота" },
      { status: 500 },
    );
  }
}
