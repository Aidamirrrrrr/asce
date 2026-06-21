"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { GitBranchIcon } from "lucide-react";
import { domAnimation, LazyMotion, m } from "motion/react";
import { getNodeRevealMotionProps } from "@/app/_home/flow/node-reveal-motion";
import { Card, CardContent } from "@/components/ui/card";
import { buildConditionPreview, normalizeConditionNodeData } from "@/lib/flow/condition-node-utils";
import { FLOW_NODE_CARD_CLASS, FLOW_NODE_CONTENT_CLASS } from "@/lib/flow/flow-layout";
import type { ConditionNodeData } from "@/lib/flow/flow-schema";
import { cn } from "@/lib/utils";

export function ConditionNode(props: NodeProps) {
  const nodeData = props.data as ConditionNodeData;
  const data = normalizeConditionNodeData(nodeData);
  const preview = buildConditionPreview(data);
  const label = data.label || "Условие";
  const isExiting = (props.data as { isExiting?: boolean }).isExiting === true;
  const motionProps = getNodeRevealMotionProps(nodeData);

  return (
    <LazyMotion features={domAnimation}>
      <m.div className="relative origin-center pb-8" {...motionProps}>
        {!isExiting ? (
          <Handle
            type="target"
            position={Position.Left}
            className="!size-2.5 !border-2 !border-background !bg-primary"
          />
        ) : null}

        {!isExiting ? (
          <>
            <Handle
              id="yes"
              type="source"
              position={Position.Right}
              className="!size-2.5 !border-2 !border-background !bg-emerald-500"
            />
            <span className="pointer-events-none absolute top-[38%] left-[calc(100%+10px)] -translate-y-1/2 text-[10px] text-muted-foreground">
              Да
            </span>
            <Handle
              id="no"
              type="source"
              position={Position.Bottom}
              className="!size-2.5 !border-2 !border-background !bg-rose-500"
            />
            <span className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 text-[10px] text-muted-foreground">
              Нет
            </span>
          </>
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
              <GitBranchIcon className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-tight">{label}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{preview}</p>
            </div>
          </CardContent>
        </Card>
      </m.div>
    </LazyMotion>
  );
}
