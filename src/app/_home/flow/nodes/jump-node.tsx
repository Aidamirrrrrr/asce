"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { CornerRightDownIcon } from "lucide-react";
import { domAnimation, LazyMotion, m } from "motion/react";
import { getNodeRevealMotionProps } from "@/app/_home/flow/node-reveal-motion";
import { Card, CardContent } from "@/components/ui/card";
import { FLOW_NODE_CARD_CLASS, FLOW_NODE_CONTENT_CLASS } from "@/lib/flow/flow-layout";
import type { JumpNodeData } from "@/lib/flow/flow-schema";
import { normalizeJumpNodeData } from "@/lib/flow/jump-node-utils";
import { cn } from "@/lib/utils";

export function JumpNode(props: NodeProps) {
  const nodeData = props.data as JumpNodeData;
  const data = normalizeJumpNodeData(nodeData);
  const label = data.label || "Переход";
  const isExiting = (props.data as { isExiting?: boolean }).isExiting === true;
  const motionProps = getNodeRevealMotionProps(nodeData);

  return (
    <LazyMotion features={domAnimation}>
      <m.div className="relative origin-center" {...motionProps}>
        {!isExiting ? (
          <Handle
            type="target"
            position={Position.Left}
            className="!size-2.5 !border-2 !border-background !bg-primary"
          />
        ) : null}

        <Card
          className={cn(
            FLOW_NODE_CARD_CLASS,
            props.selected && !isExiting && "ring-2 ring-primary/40",
            isExiting && "pointer-events-none shadow-none",
          )}
        >
          <CardContent className={FLOW_NODE_CONTENT_CLASS}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <CornerRightDownIcon className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-tight">{label}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {data.targetNodeId ? `→ ${data.targetNodeId}` : "(цель не задана)"}
              </p>
            </div>
          </CardContent>
        </Card>
        {/* jump не имеет исходящего handle: выполнение переходит через targetNodeId */}
      </m.div>
    </LazyMotion>
  );
}
