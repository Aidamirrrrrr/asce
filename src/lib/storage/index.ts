import path from "node:path";

import { LocalDiskStorage } from "@/lib/storage/local-storage";
import { S3Storage } from "@/lib/storage/s3-storage";
import type { StorageDriver } from "@/lib/storage/types";

let storageInstance: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (storageInstance) {
    return storageInstance;
  }

  const driver =
    process.env.MEDIA_STORAGE_DRIVER ?? (process.env.NODE_ENV === "production" ? "s3" : "local");

  if (driver === "s3") {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION ?? "us-east-1";

    if (!bucket) {
      throw new Error("S3_BUCKET is required when MEDIA_STORAGE_DRIVER=s3");
    }

    storageInstance = new S3Storage(bucket, region, process.env.S3_ENDPOINT);
    return storageInstance;
  }

  const basePath = path.resolve(process.cwd(), process.env.MEDIA_STORAGE_PATH ?? "./uploads");
  storageInstance = new LocalDiskStorage(basePath);
  return storageInstance;
}

export function buildAssetStorageKey(projectId: string, assetId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${projectId}/${assetId}/${safeName}`;
}

export type { AssetKind, StorageDriver, StoredObject } from "@/lib/storage/types";
