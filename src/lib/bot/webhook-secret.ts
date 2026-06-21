import { randomBytes } from "node:crypto";

import type { Project } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

export async function ensureProjectWebhookSecret(project: Project): Promise<Project> {
  if (project.webhookSecret) {
    return project;
  }

  return db.project.update({
    where: { id: project.id },
    data: { webhookSecret: generateWebhookSecret() },
  });
}
