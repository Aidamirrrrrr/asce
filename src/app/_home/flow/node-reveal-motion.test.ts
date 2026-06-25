import { describe, expect, it } from "vitest";

import { getNodeRevealMotionProps } from "@/app/_home/flow/node-reveal-motion";

describe("getNodeRevealMotionProps", () => {
  it("staggers stream reveal by revealIndex", () => {
    const first = getNodeRevealMotionProps({
      label: "A",
      streamReveal: true,
      revealIndex: 0,
    });
    const third = getNodeRevealMotionProps({
      label: "C",
      streamReveal: true,
      revealIndex: 2,
    });

    expect(first.transition).toMatchObject({ delay: 0 });
    expect(third.transition).toMatchObject({ delay: 0.18 });
  });
});
