import { NextResponse } from "next/server";

import { createProjectAsset, inferAssetKind } from "@/lib/assets/project-assets";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import type { AssetKind } from "@/lib/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const { id: projectId } = await context.params;
    const owned = await getOwnedProject(authResult.userId, projectId);
    if ("error" in owned) {
      return owned.error;
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }

    const kindParam = formData.get("kind");
    const mimeType = file.type || "application/octet-stream";
    const kind =
      typeof kindParam === "string" && isAssetKind(kindParam)
        ? kindParam
        : inferAssetKind(mimeType);

    if (!kind) {
      return NextResponse.json({ error: "Не удалось определить тип вложения" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await createProjectAsset({
      projectId,
      kind,
      fileName: file.name || "file",
      mimeType,
      buffer,
    });

    return NextResponse.json({
      asset: {
        id: asset.id,
        kind: asset.kind,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        createdAt: asset.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить файл" },
      { status: 400 },
    );
  }
}

function isAssetKind(value: string): value is AssetKind {
  return (
    value === "photo" ||
    value === "video" ||
    value === "document" ||
    value === "video_note" ||
    value === "audio"
  );
}
