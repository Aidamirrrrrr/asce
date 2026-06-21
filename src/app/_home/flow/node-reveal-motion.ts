import type { FlowNodeData, FlowNodeTransientData } from "@/lib/flow/flow-schema";
import { duration, gentleEase } from "@/lib/motion";

export function getNodeRevealMotionProps(data: FlowNodeData & FlowNodeTransientData) {
  const isExiting = data.isExiting === true;
  const isEntering = data.isEntering === true;
  const streamReveal = data.streamReveal === true;
  const revealIndex = typeof data.revealIndex === "number" ? data.revealIndex : 0;

  if (isExiting) {
    return {
      initial: false as const,
      animate: { opacity: 0, scale: 0.98 },
      transition: { duration: duration.normal, ease: gentleEase },
    };
  }

  if (streamReveal) {
    return {
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: duration.normal, ease: gentleEase },
    };
  }

  return {
    initial: false as const,
    animate: {
      opacity: isEntering ? 0 : 1,
      scale: isEntering ? 0.96 : 1,
    },
    transition: {
      duration: duration.normal,
      ease: gentleEase,
      delay: isEntering ? 0 : revealIndex * 0.07,
    },
  };
}
