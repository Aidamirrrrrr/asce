import { decryptSecretValue, encryptSecretValue } from "@/lib/crypto/secrets-crypto";
import { db } from "@/lib/db";
import { maskBotToken } from "@/lib/projects";

export type ProjectSecretSummary = {
  key: string;
  label: string | null;
  description: string | null;
  hasValue: boolean;
  masked: string | null;
};

export async function loadProjectSecrets(projectId: string): Promise<Record<string, string>> {
  const rows = await db.projectSecret.findMany({
    where: { projectId },
    select: { key: true, value: true },
  });

  const secrets: Record<string, string> = {};
  for (const row of rows) {
    if (row.value) {
      secrets[`secret.${row.key}`] = decryptSecretValue(row.value);
    }
  }

  return secrets;
}

export async function listProjectSecretSummaries(
  projectId: string,
): Promise<ProjectSecretSummary[]> {
  const rows = await db.projectSecret.findMany({
    where: { projectId },
    orderBy: { key: "asc" },
    select: {
      key: true,
      value: true,
      label: true,
      description: true,
    },
  });

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    description: row.description,
    hasValue: Boolean(row.value),
    masked: row.value ? maskBotToken(decryptSecretValue(row.value)) : null,
  }));
}

export async function upsertProjectSecrets(
  projectId: string,
  secrets: Array<{ key: string; value?: string; label?: string; description?: string }>,
): Promise<void> {
  for (const secret of secrets) {
    const key = secret.key.trim();
    if (!key) {
      continue;
    }

    const existing = await db.projectSecret.findUnique({
      where: { projectId_key: { projectId, key } },
    });

    if (existing) {
      await db.projectSecret.update({
        where: { projectId_key: { projectId, key } },
        data: {
          ...(secret.value !== undefined
            ? { value: secret.value ? encryptSecretValue(secret.value) : "" }
            : {}),
          ...(secret.label !== undefined ? { label: secret.label } : {}),
          ...(secret.description !== undefined ? { description: secret.description } : {}),
        },
      });
      continue;
    }

    await db.projectSecret.create({
      data: {
        projectId,
        key,
        value: secret.value ? encryptSecretValue(secret.value) : "",
        label: secret.label ?? null,
        description: secret.description ?? null,
      },
    });
  }
}

export async function syncFlowSecretDeclarations(
  projectId: string,
  declarations: Array<{ key: string; label?: string; description?: string }>,
): Promise<void> {
  for (const declaration of declarations) {
    const key = declaration.key.trim();
    if (!key) {
      continue;
    }

    const existing = await db.projectSecret.findUnique({
      where: { projectId_key: { projectId, key } },
    });

    if (existing) {
      await db.projectSecret.update({
        where: { projectId_key: { projectId, key } },
        data: {
          ...(declaration.label !== undefined ? { label: declaration.label } : {}),
          ...(declaration.description !== undefined
            ? { description: declaration.description }
            : {}),
        },
      });
      continue;
    }

    await db.projectSecret.create({
      data: {
        projectId,
        key,
        value: "",
        label: declaration.label ?? null,
        description: declaration.description ?? null,
      },
    });
  }
}

export type ProjectSecretsReadiness = {
  total: number;
  filled: number;
  missing: ProjectSecretSummary[];
  ready: boolean;
};

export async function getProjectSecretsReadiness(
  projectId: string,
): Promise<ProjectSecretsReadiness> {
  const secrets = await listProjectSecretSummaries(projectId);
  const missing = secrets.filter((secret) => !secret.hasValue);

  return {
    total: secrets.length,
    filled: secrets.length - missing.length,
    missing,
    ready: secrets.length === 0 || missing.length === 0,
  };
}

export async function findMissingRequiredSecrets(
  projectId: string,
  requiredKeys: string[],
): Promise<string[]> {
  if (requiredKeys.length === 0) {
    return [];
  }

  const rows = await db.projectSecret.findMany({
    where: { projectId, key: { in: requiredKeys } },
    select: { key: true, value: true },
  });

  const valueByKey = new Map(
    rows.map((row) => [row.key, row.value ? decryptSecretValue(row.value) : ""]),
  );
  return requiredKeys.filter((key) => !valueByKey.get(key)?.trim());
}
