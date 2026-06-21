import { describe, expect, it } from "vitest";

import { buttonLabelMatches, normalizeBranchLabel } from "@/lib/flow/flow-button-wiring";

describe("normalizeBranchLabel", () => {
  it("folds Latin M to Cyrillic М for button matching", () => {
    expect(normalizeBranchLabel("Mужская стрижка")).toBe(normalizeBranchLabel("Мужская стрижка"));
    expect(buttonLabelMatches("Мужская стрижка", "Mужская стрижка")).toBe(true);
  });
});
