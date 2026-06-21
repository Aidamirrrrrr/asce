import { db } from "@/lib/db";

export async function markProjectStopped(projectId: string): Promise<void> {
  await db.project.update({
    where: { id: projectId },
    data: {
      runtimeStatus: "stopped",
      status: "draft",
    },
  });
}

export async function markProjectError(projectId: string, message: string): Promise<void> {
  await db.project.update({
    where: { id: projectId },
    data: {
      runtimeStatus: "error",
      lastError: message,
    },
  });
}
