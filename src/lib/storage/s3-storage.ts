import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { StorageDriver } from "@/lib/storage/types";

function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Promise.resolve(Buffer.alloc(0));
  }

  if (Buffer.isBuffer(body)) {
    return Promise.resolve(body);
  }

  if (body instanceof Uint8Array) {
    return Promise.resolve(Buffer.from(body));
  }

  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Buffer[] = [];

  return (async () => {
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  })();
}

export function isMissingBucketError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    record.$metadata?.httpStatusCode === 404 ||
    record.name === "NotFound" ||
    record.name === "NoSuchBucket"
  );
}

export function isBucketAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { name?: string };
  return record.name === "BucketAlreadyOwnedByYou" || record.name === "BucketAlreadyExists";
}

export class S3Storage implements StorageDriver {
  private readonly client: S3Client;
  private readonly ready: Promise<void>;

  constructor(
    private readonly bucket: string,
    region: string,
    endpoint?: string,
  ) {
    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
    this.ready = this.ensureBucket();
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!isMissingBucketError(error)) {
        throw error;
      }
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (createError) {
        if (!isBucketAlreadyExistsError(createError)) {
          throw createError;
        }
      }
    }
  }

  private async whenReady<T>(operation: () => Promise<T>): Promise<T> {
    await this.ready;
    return operation();
  }

  async put(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.whenReady(() =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        }),
      ),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.whenReady(() =>
      this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })),
    );
    return streamToBuffer(response.Body);
  }

  async delete(key: string): Promise<void> {
    await this.whenReady(() =>
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })),
    );
  }

  async getPublicUrl(key: string): Promise<string> {
    await this.ready;
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 3600,
    });
  }
}
