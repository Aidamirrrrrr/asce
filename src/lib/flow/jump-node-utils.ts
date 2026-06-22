import type { JumpNodeData } from "@/lib/flow/flow-schema";

export function normalizeJumpNodeData(data: JumpNodeData): JumpNodeData {
  return {
    label: data.label ?? "Переход",
    targetNodeId: data.targetNodeId ?? "",
  };
}
