"use client";

import type { NodeProps } from "@xyflow/react";
import { ClockIcon, ZapIcon } from "lucide-react";
import { BaseNode } from "@/app/_home/flow/nodes/base-node";
import type { TriggerNodeData } from "@/lib/flow/flow-schema";
import { formatInactivityTriggerPreview } from "@/lib/flow/trigger-node-utils";

export function TriggerNode(props: NodeProps) {
  const data = props.data as TriggerNodeData;
  const preview = formatInactivityTriggerPreview(data);
  const Icon = data.triggerType === "inactivity" ? ClockIcon : ZapIcon;

  return <BaseNode {...props} icon={Icon} preview={preview} hasTarget={false} hasSource />;
}
