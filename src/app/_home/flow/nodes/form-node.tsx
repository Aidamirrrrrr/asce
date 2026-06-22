"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { ClipboardListIcon } from "lucide-react";
import { domAnimation, LazyMotion, m } from "motion/react";
import { getNodeRevealMotionProps } from "@/app/_home/flow/node-reveal-motion";
import { Card, CardContent } from "@/components/ui/card";
import { FLOW_NODE_CARD_CLASS, FLOW_NODE_CONTENT_CLASS } from "@/lib/flow/flow-layout";
import type { FormNodeData } from "@/lib/flow/flow-schema";
import { buildFormPreview, normalizeFormNodeData } from "@/lib/flow/form-node-utils";
import { cn } from "@/lib/utils";

export function FormNode(props: NodeProps) {
  const nodeData = props.data as FormNodeData;
  const data = normalizeFormNodeData(nodeData);
  const preview = buildFormPreview(data);
  const label = data.label || "Форма";
  const count = data.questions?.length ?? 0;
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
              <ClipboardListIcon className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="font-medium leading-tight">{label}</p>
                <span className="text-[10px] text-muted-foreground">
                  {count} {count === 1 ? "вопрос" : count < 5 ? "вопроса" : "вопросов"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{preview}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {data.questions.slice(0, 4).map((q) => (
                  <span
                    key={q.variableKey}
                    className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground"
                  >
                    {q.variableKey}
                  </span>
                ))}
                {count > 4 && (
                  <span className="text-[10px] text-muted-foreground">+{count - 4}</span>
                )}
              </div>
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
