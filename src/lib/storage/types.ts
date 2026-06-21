export type AssetKind = "photo" | "video" | "document" | "video_note" | "audio";

export type StoredObject = {
  storageKey: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
};

export type StorageDriver = {
  put(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getPublicUrl?(key: string): Promise<string | null>;
};
