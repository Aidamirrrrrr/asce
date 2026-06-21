import { NextResponse } from "next/server";

import { getAssetSignedUrl, getProjectAsset, readAssetBuffer } from "@/lib/assets/project-assets";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import { getStorageDriver } from "@/lib/storage";

type RouteContext = {
  params: Promise<{ id: string; assetId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const { id: projectId, assetId } = await context.params;
    const owned = await getOwnedProject(authResult.userId, projectId);
    if ("error" in owned) {
      return owned.error;
    }

    const asset = await getProjectAsset(projectId, assetId);
    if (!asset) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }

    const signedUrl = await getAssetSignedUrl(projectId, assetId);
    if (signedUrl) {
      return NextResponse.redirect(signedUrl);
    }

    const buffer = await readAssetBuffer(projectId, assetId);
    if (!buffer) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Content-Disposition": `inline; filename="${encodeURIComponent(asset.fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось отдать файл" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) {
      return authResult.error;
    }

    const { id: projectId, assetId } = await context.params;
    const owned = await getOwnedProject(authResult.userId, projectId);
    if ("error" in owned) {
      return owned.error;
    }

    const asset = await getProjectAsset(projectId, assetId);
    if (!asset) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }

    const storage = getStorageDriver();
    await storage.delete(asset.storageKey);

    const { db } = await import("@/lib/db");
    await db.projectAsset.delete({ where: { id: assetId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось удалить файл" },
      { status: 500 },
    );
  }
}
