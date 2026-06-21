import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Project } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type AuthError = { error: NextResponse };

export async function requireUser(): Promise<{ userId: string } | AuthError> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId };
}

export async function getOwnedProject(
  userId: string,
  projectId: string,
): Promise<{ project: Project } | AuthError> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) {
    return { error: NextResponse.json({ error: "Проект не найден" }, { status: 404 }) };
  }
  return { project };
}
