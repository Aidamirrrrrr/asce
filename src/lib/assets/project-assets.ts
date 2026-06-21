import { db } from "@/lib/db";
import { type AssetKind, buildAssetStorageKey, getStorageDriver } from "@/lib/storage";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const MIME_BY_KIND: Record<AssetKind, string[]> = {
  photo: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "application/zip",
  ],
  video_note: ["video/mp4"],
  audio: ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav"],
};

export function inferAssetKind(mimeType: string): AssetKind | null {
  for (const [kind, mimes] of Object.entries(MIME_BY_KIND) as [AssetKind, string[]][]) {
    if (mimes.includes(mimeType)) {
      return kind;
    }
  }
  if (mimeType.startsWith("image/")) {
    return "photo";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  return "document";
}

export function validateUpload(
  mimeType: string,
  sizeBytes: number,
  kind?: AssetKind,
): string | null {
  if (sizeBytes <= 0) {
    return "Пустой файл";
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return "Файл слишком большой (макс. 50 МБ)";
  }

  const inferred = kind ?? inferAssetKind(mimeType);
  if (!inferred) {
    return "Неподдерживаемый тип файла";
  }

  const allowed = MIME_BY_KIND[inferred];
  if (!allowed.includes(mimeType) && inferred !== "document") {
    return `Для типа «${inferred}» нужен другой формат файла`;
  }

  return null;
}

export async function createProjectAsset(input: {
  projectId: string;
  kind: AssetKind;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const validationError = validateUpload(input.mimeType, input.buffer.byteLength, input.kind);
  if (validationError) {
    throw new Error(validationError);
  }

  const asset = await db.projectAsset.create({
    data: {
      projectId: input.projectId,
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
      storageKey: "",
    },
  });

  const storageKey = buildAssetStorageKey(input.projectId, asset.id, input.fileName);
  const storage = getStorageDriver();
  await storage.put(storageKey, input.buffer, input.mimeType);

  return db.projectAsset.update({
    where: { id: asset.id },
    data: { storageKey },
  });
}

export async function getProjectAsset(projectId: string, assetId: string) {
  return db.projectAsset.findFirst({
    where: { id: assetId, projectId },
  });
}

export async function readAssetBuffer(projectId: string, assetId: string): Promise<Buffer | null> {
  const asset = await getProjectAsset(projectId, assetId);
  if (!asset) {
    return null;
  }

  const storage = getStorageDriver();
  return storage.get(asset.storageKey);
}

export async function updateAssetTelegramFileId(assetId: string, telegramFileId: string) {
  return db.projectAsset.update({
    where: { id: assetId },
    data: { telegramFileId },
  });
}

export async function getAssetSignedUrl(
  projectId: string,
  assetId: string,
): Promise<string | null> {
  const asset = await getProjectAsset(projectId, assetId);
  if (!asset) {
    return null;
  }

  const storage = getStorageDriver();
  if (storage.getPublicUrl) {
    return storage.getPublicUrl(asset.storageKey);
  }

  return null;
}
