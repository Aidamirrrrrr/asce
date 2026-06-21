import { describe, expect, it } from "vitest";

import { createDefaultNodeData, createFlowNodeId } from "@/lib/flow/flow-schema";
import {
  applyInferredSecretsToFlow,
  inferSecretRecipeEntriesFromFlow,
} from "@/lib/flow/secret-recipes";

describe("applyInferredSecretsToFlow", () => {
  it("adds ADMIN_CHAT_ID when admin_notify node is present", () => {
    const doc = applyInferredSecretsToFlow({
      nodes: [
        {
          id: createFlowNodeId("admin_notify"),
          type: "admin_notify",
          position: { x: 0, y: 0 },
          data: createDefaultNodeData("admin_notify"),
        },
      ],
      edges: [],
    });

    expect(doc.secrets?.some((secret) => secret.key === "ADMIN_CHAT_ID")).toBe(true);
  });

  it("does not duplicate existing secret declarations", () => {
    const doc = applyInferredSecretsToFlow({
      nodes: [
        {
          id: createFlowNodeId("admin_notify"),
          type: "admin_notify",
          position: { x: 0, y: 0 },
          data: createDefaultNodeData("admin_notify"),
        },
      ],
      edges: [],
      secrets: [
        {
          key: "ADMIN_CHAT_ID",
          label: "Мой админ",
          description: "Уже задан",
        },
      ],
    });

    expect(doc.secrets).toHaveLength(1);
    expect(doc.secrets?.[0]?.label).toBe("Мой админ");
  });

  it("infers secrets referenced as {{secret.KEY}} in node fields", () => {
    const entries = inferSecretRecipeEntriesFromFlow({
      nodes: [
        {
          id: createFlowNodeId("http_request"),
          type: "http_request",
          position: { x: 0, y: 0 },
          data: {
            ...createDefaultNodeData("http_request"),
            url: "https://api.example.com",
            headers: [{ key: "Authorization", value: "Bearer {{secret.EXTERNAL_API_KEY}}" }],
          },
        },
      ],
    });

    expect(entries.some((entry) => entry.key === "EXTERNAL_API_KEY")).toBe(true);
  });
});
