import { NextResponse } from "next/server";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import {
  getProjectSecretsReadiness,
  listProjectSecretSummaries,
  upsertProjectSecrets,
} from "@/lib/bot/project-secrets";
import { buildProjectPublicUrls, getProjectSecretSuggestions } from "@/lib/bot/public-api-urls";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
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

    const project = owned.project;

    const secrets = await listProjectSecretSummaries(id);
    const readiness = await getProjectSecretsReadiness(id);
    const suggestedValues = getProjectSecretSuggestions(id, {
      webhookSecret: project.webhookSecret,
    });
    const publicUrls = buildProjectPublicUrls(id, {
      webhookSecret: project.webhookSecret,
    });

    return NextResponse.json({ secrets, readiness, suggestedValues, publicUrls });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить секреты" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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

    const body = (await request.json()) as {
      secrets?: Array<{ key: string; value?: string }>;
    };

    const project = owned.project;

    if (!Array.isArray(body.secrets)) {
      return NextResponse.json({ error: "Некорректный формат секретов" }, { status: 400 });
    }

    await upsertProjectSecrets(
      id,
      body.secrets.map((secret) => ({
        key: secret.key,
        ...(secret.value !== undefined ? { value: secret.value } : {}),
      })),
    );

    const secrets = await listProjectSecretSummaries(id);
    const readiness = await getProjectSecretsReadiness(id);
    const suggestedValues = getProjectSecretSuggestions(id, {
      webhookSecret: project.webhookSecret,
    });
    const publicUrls = buildProjectPublicUrls(id, {
      webhookSecret: project.webhookSecret,
    });

    return NextResponse.json({ secrets, readiness, suggestedValues, publicUrls });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить секреты" },
      { status: 500 },
    );
  }
}
