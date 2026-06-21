import OpenAI from "openai";
import { describe, expect, it } from "vitest";

import {
  buildLlmServiceErrorMessage,
  isLlmServiceError,
  isRetryableLlmError,
} from "@/lib/ai/llm-retry";

describe("isRetryableLlmError", () => {
  it("retries OpenAI 500 errors", () => {
    expect(
      isRetryableLlmError(new OpenAI.APIError(500, undefined, "server error", undefined)),
    ).toBe(true);
  });

  it("retries gateway message text", () => {
    expect(
      isRetryableLlmError(
        new Error("500 Something went wrong on our side. Please try again later."),
      ),
    ).toBe(true);
  });

  it("does not retry validation errors", () => {
    expect(isRetryableLlmError(new OpenAI.APIError(400, undefined, "bad request", undefined))).toBe(
      false,
    );
  });
});

describe("isLlmServiceError", () => {
  it("treats retryable gateway failures as service errors", () => {
    expect(
      isLlmServiceError(new Error("500 Something went wrong on our side. Please try again later.")),
    ).toBe(true);
  });
});

describe("buildLlmServiceErrorMessage", () => {
  it("returns a friendly message for transient failures", () => {
    expect(
      buildLlmServiceErrorMessage(
        new Error("500 Something went wrong on our side. Please try again later."),
      ),
    ).toContain("временно недоступен");
  });
});
