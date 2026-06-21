import { describe, expect, it } from "vitest";

import {
  describeProjectDataSchema,
  executeProjectDataQuery,
  parseProjectDataQuery,
} from "@/lib/analytics/project-data-query";

describe("parseProjectDataQuery", () => {
  it("accepts a valid records list query with data filter", () => {
    const parsed = parseProjectDataQuery({
      entity: "records",
      operation: "list",
      days: 7,
      filters: [{ field: "data.phone", op: "contains", value: "999" }],
      limit: 10,
    });

    expect(parsed).not.toHaveProperty("error");
    if (!("error" in parsed)) {
      expect(parsed.entity).toBe("records");
      expect(parsed.filters?.[0]?.field).toBe("data.phone");
    }
  });

  it("rejects unknown entity", () => {
    const parsed = parseProjectDataQuery({ entity: "secrets", operation: "count" });
    expect(parsed).toEqual({ error: expect.stringContaining("entity") });
  });
});

describe("describeProjectDataSchema", () => {
  it("documents all entities", () => {
    const schema = describeProjectDataSchema();
    expect(schema.entities.map((item) => item.name)).toEqual([
      "bot_users",
      "bot_events",
      "records",
      "user_variables",
    ]);
  });
});

describe("executeProjectDataQuery", () => {
  it("returns structured error for invalid query", async () => {
    const result = await executeProjectDataQuery("proj-1", {
      entity: "records",
      operation: "group_by",
    });
    expect(result).toEqual({ error: expect.stringContaining("groupBy") });
  });
});
