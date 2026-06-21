import type { Project } from "@/generated/prisma/client";
import { decryptSecretValue, encryptSecretValue } from "@/lib/crypto/secrets-crypto";

export function encryptBotTokenForStorage(token: string | null | undefined): string | null {
  if (!token?.trim()) {
    return null;
  }

  return encryptSecretValue(token.trim());
}

export function decryptBotTokenFromStorage(token: string | null | undefined): string | null {
  if (!token?.trim()) {
    return null;
  }

  return decryptSecretValue(token);
}

export function withDecryptedBotToken<P extends Pick<Project, "botToken">>(project: P): P {
  if (!project.botToken) {
    return project;
  }

  return {
    ...project,
    botToken: decryptBotTokenFromStorage(project.botToken),
  };
}

export function requireDecryptedBotToken(project: Pick<Project, "botToken">): string {
  const token = withDecryptedBotToken(project).botToken;
  if (!token) {
    throw new Error("Токен бота не задан");
  }

  return token;
}
