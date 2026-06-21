import { describe, expect, it } from "vitest";

import { isBucketAlreadyExistsError, isMissingBucketError } from "@/lib/storage/s3-storage";

describe("isMissingBucketError", () => {
  it("detects 404 and known error names", () => {
    expect(isMissingBucketError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
    expect(isMissingBucketError({ name: "NotFound" })).toBe(true);
    expect(isMissingBucketError({ name: "NoSuchBucket" })).toBe(true);
    expect(isMissingBucketError({ name: "AccessDenied" })).toBe(false);
  });
});

describe("isBucketAlreadyExistsError", () => {
  it("detects duplicate bucket errors", () => {
    expect(isBucketAlreadyExistsError({ name: "BucketAlreadyOwnedByYou" })).toBe(true);
    expect(isBucketAlreadyExistsError({ name: "BucketAlreadyExists" })).toBe(true);
    expect(isBucketAlreadyExistsError({ name: "NotFound" })).toBe(false);
  });
});
