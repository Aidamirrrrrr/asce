"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import { domAnimation, LazyMotion, m } from "motion/react";
import { getNodeRevealMotionProps } from "@/app/_home/flow/node-reveal-motion";
import { Card, CardContent } from "@/components/ui/card";
import { FLOW_NODE_CARD_CLASS, FLOW_NODE_CONTENT_CLASS } from "@/lib/flow/flow-layout";
import type { FlowNodeData, FlowNodeTransientData } from "@/lib/flow/flow-schema";
import { cn } from "@/lib/utils";

type BaseNodeProps = NodeProps & {
  icon: LucideIcon;
  preview?: string;
  hasTarget?: boolean;
  hasSource?: boolean;
};

export function BaseNode({
  selected,
  icon: Icon,
  data,
  preview,
  hasTarget = true,
  hasSource = true,
}: BaseNodeProps) {
  const nodeData = data as FlowNodeData & FlowNodeTransientData;
  const label = typeof nodeData.label === "string" ? nodeData.label : "Узел";
  const isExiting = nodeData.isExiting === true;
  const motionProps = getNodeRevealMotionProps(nodeData);

  return (
    <LazyMotion features={domAnimation}>
      <m.div className="origin-center" {...motionProps}>
        <Card
          className={cn(
            FLOW_NODE_CARD_CLASS,
            selected && !isExiting && "ring-2 ring-primary/40",
            isExiting && "pointer-events-none shadow-none",
          )}
        >
          {hasTarget && !isExiting ? (
            <Handle
              type="target"
              position={Position.Left}
              className="!size-2.5 !border-2 !border-background !bg-primary"
            />
          ) : null}
          {hasSource && !isExiting ? (
            <Handle
              id="next"
              type="source"
              position={Position.Right}
              className="!size-2.5 !border-2 !border-background !bg-primary"
            />
          ) : null}

          <CardContent className={FLOW_NODE_CONTENT_CLASS}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-tight">{label}</p>
              {preview ? (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{preview}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </m.div>
    </LazyMotion>
  );
}
