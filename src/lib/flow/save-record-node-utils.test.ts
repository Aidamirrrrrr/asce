import { describe, expect, it } from "vitest";

import {
  normalizeCollectionName,
  normalizeSaveRecordNodeData,
} from "@/lib/flow/save-record-node-utils";

describe("normalizeCollectionName", () => {
  it("lowercases and slugs to latin/underscore", () => {
    expect(normalizeCollectionName("My Leads!")).toBe("my_leads");
    expect(normalizeCollectionName("  Orders  ")).toBe("orders");
  });

  it("falls back to a default when empty/invalid", () => {
    expect(normalizeCollectionName("")).toBe("records");
    expect(normalizeCollectionName(123)).toBe("records");
  });
});

describe("normalizeSaveRecordNodeData", () => {
  it("keeps valid fields and template values, drops keyless fields", () => {
    const data = normalizeSaveRecordNodeData({
      collection: "Leads",
      fields: [
        { key: "name", value: "{{var.first_name}}" },
        { key: "", value: "ignored" },
        { value: "no key" },
      ],
    });

    expect(data.collection).toBe("leads");
    expect(data.fields).toEqual([{ key: "name", value: "{{var.first_name}}" }]);
    expect(data.label).toBe("Запись");
  });

  it("tolerates missing data", () => {
    const data = normalizeSaveRecordNodeData(undefined);
    expect(data.collection).toBe("records");
    expect(data.fields).toEqual([]);
  });
});
