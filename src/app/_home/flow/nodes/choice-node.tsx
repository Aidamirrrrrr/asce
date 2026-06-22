"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { ListChecksIcon } from "lucide-react";
import { domAnimation, LazyMotion, m } from "motion/react";
import { getNodeRevealMotionProps } from "@/app/_home/flow/node-reveal-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FLOW_NODE_CARD_CLASS, FLOW_NODE_CONTENT_CLASS } from "@/lib/flow/flow-layout";
import type { ChoiceNodeData } from "@/lib/flow/flow-schema";
import {
  buildChoicePreview,
  normalizeChoiceNodeData,
} from "@/lib/flow/choice-node-utils";
import { cn } from "@/lib/utils";

export function ChoiceNode(props: NodeProps) {
  const nodeData = props.data as ChoiceNodeData;
  const data = normalizeChoiceNodeData(nodeData);
  const preview = buildChoicePreview(data);
  const label = data.label || "Выбор";
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
              <ListChecksIcon className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="font-medium leading-tight">{label}</p>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  → <span className="font-mono ml-0.5">var.{data.variableKey}</span>
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {data.prompt || "(вопрос не задан)"}
              </p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/70">
                {preview}
              </p>
            </div>
          </CardContent>
        </Card>

        {!isExiting ? (
          <Handle
            id="next"
            type="source"
            position={Position.Right}
            className="!size-2.5 !border-2 !border-background !bg-primary"
          />
        ) : null}
      </m.div>
    </LazyMotion>
  );
}
