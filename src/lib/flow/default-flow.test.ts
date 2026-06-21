import { describe, expect, it } from "vitest";

import {
  createEmptyFlow,
  createStreamingSeedFlow,
  isStreamingSeedFlow,
} from "@/lib/flow/default-flow";

describe("isStreamingSeedFlow", () => {
  it("detects the create-stream placeholder", () => {
    expect(isStreamingSeedFlow(createStreamingSeedFlow())).toBe(true);
  });

  it("returns false for empty and real flows", () => {
    expect(isStreamingSeedFlow(createEmptyFlow())).toBe(false);
    expect(isStreamingSeedFlow(null)).toBe(false);
  });
});
