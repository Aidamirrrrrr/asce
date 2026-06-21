import { db } from "@/lib/db";

export async function loadUserVars(
  projectId: string,
  userId: number | string,
): Promise<Record<string, string>> {
  const rows = await db.projectUserVariable.findMany({
    where: { projectId, userId: String(userId) },
    select: { key: true, value: true },
  });

  const vars: Record<string, string> = {};
  for (const row of rows) {
    vars[`var.${row.key}`] = row.value;
  }

  return vars;
}

export async function setUserVar(input: {
  projectId: string;
  userId: number | string;
  key: string;
  value: string;
}): Promise<void> {
  const normalizedKey = input.key.replace(/^var\./, "");

  await db.projectUserVariable.upsert({
    where: {
      projectId_userId_key: {
        projectId: input.projectId,
        userId: String(input.userId),
        key: normalizedKey,
      },
    },
    create: {
      projectId: input.projectId,
      userId: String(input.userId),
      key: normalizedKey,
      value: input.value,
    },
    update: {
      value: input.value,
    },
  });
}

export async function deleteUserVar(input: {
  projectId: string;
  userId: number | string;
  key: string;
}): Promise<void> {
  const normalizedKey = input.key.replace(/^var\./, "");

  await db.projectUserVariable.deleteMany({
    where: {
      projectId: input.projectId,
      userId: String(input.userId),
      key: normalizedKey,
    },
  });
}
