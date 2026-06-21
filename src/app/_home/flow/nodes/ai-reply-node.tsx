"use client";

import type { NodeProps } from "@xyflow/react";
import { SparklesIcon } from "lucide-react";
import { BaseNode } from "@/app/_home/flow/nodes/base-node";
import type { AiReplyNodeData } from "@/lib/flow/flow-schema";

export function AiReplyNode(props: NodeProps) {
  const data = props.data as AiReplyNodeData;

  return (
    <BaseNode
      {...props}
      icon={SparklesIcon}
      preview={data.systemPrompt || "Без system prompt"}
      hasSource={false}
    />
  );
}
