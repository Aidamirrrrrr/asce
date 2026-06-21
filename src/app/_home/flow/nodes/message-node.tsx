"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { MessageSquareIcon } from "lucide-react";
import { domAnimation, LazyMotion, m } from "motion/react";
import { getNodeRevealMotionProps } from "@/app/_home/flow/node-reveal-motion";
import { Card, CardContent } from "@/components/ui/card";
import { getBranchSourcePosition, type HandleSide } from "@/lib/flow/branch-handle-utils";
import { FLOW_NODE_CARD_CLASS, FLOW_NODE_CONTENT_CLASS } from "@/lib/flow/flow-layout";
import type { FlowNode, FlowNodeTransientData, MessageNodeData } from "@/lib/flow/flow-schema";
import {
  buildMessagePreview,
  getMessageSourceHandles,
  normalizeMessageNodeData,
} from "@/lib/flow/message-node-utils";
import { cn } from "@/lib/utils";

const SIDE_TO_POSITION: Record<HandleSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

export function MessageNode(props: NodeProps) {
  const nodeData = props.data as MessageNodeData;
  const data = normalizeMessageNodeData(nodeData);
  const backLinks = (props.data as FlowNodeTransientData).backLinks ?? {};
  const handles = getMessageSourceHandles(data);
  const buttonHandles = handles.filter((handle) => handle.id !== "next");
  const preview = buildMessagePreview(data);
  const label = data.label || "Сообщение";
  const isExiting = (props.data as { isExiting?: boolean }).isExiting === true;
  const hasNextEdge = (props.data as FlowNodeTransientData).hasNextEdge === true;
  const motionProps = getNodeRevealMotionProps(
    props.data as MessageNodeData & FlowNodeTransientData,
  );
  const flowNode: FlowNode = {
    id: props.id,
    type: "message",
    position: { x: 0, y: 0 },
    data,
  };

  const handleSides = (props.data as FlowNodeTransientData).handleSides ?? {};
  const fallbackSide = (handleId: string): HandleSide =>
    getBranchSourcePosition(flowNode, handleId) === Position.Right ? "right" : "bottom";

  // Сторону хендла берём по геометрии цели (handleSides) — в т.ч. для кнопок-«назад»,
  // чтобы их пунктирная линия шла В СТОРОНУ меню, а не завивалась крючком снизу.
  // Несколько хендлов на одной стороне равномерно разносим.
  const resolvedRaw = buttonHandles.map((handle) => {
    const isBack = handle.id in backLinks;
    const side: HandleSide =
      handleSides[handle.id] ?? (isBack ? "bottom" : fallbackSide(handle.id));
    return { handle, isBack, side };
  });
  const sideTotals: Record<string, number> = {};
  for (const item of resolvedRaw) {
    sideTotals[item.side] = (sideTotals[item.side] ?? 0) + 1;
  }
  const sideSeen: Record<string, number> = {};
  const resolvedHandles = resolvedRaw.map((item) => {
    const seen = sideSeen[item.side] ?? 0;
    sideSeen[item.side] = seen + 1;
    const total = sideTotals[item.side] ?? 1;
    const fraction = total === 1 ? 0.5 : (seen + 1) / (total + 1);
    return { ...item, fraction };
  });

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className={cn("relative origin-center", buttonHandles.length > 0 && "pb-8")}
        {...motionProps}
      >
        {!isExiting ? (
          <Handle
            type="target"
            position={Position.Left}
            className="!size-2.5 !border-2 !border-background !bg-primary"
          />
        ) : null}

        {!isExiting && (buttonHandles.length === 0 || hasNextEdge) ? (
          <Handle
            id="next"
            type="source"
            position={Position.Right}
            style={buttonHandles.length > 0 ? { top: "50%" } : undefined}
            className="!size-2.5 !border-2 !border-background !bg-primary"
          />
        ) : null}

        <Card
          className={cn(
            FLOW_NODE_CARD_CLASS,
            props.selected && !isExiting && "ring-2 ring-primary/40",
            isExiting && "pointer-events-none shadow-none",
            buttonHandles.length > 0 && "mb-0",
          )}
        >
          <CardContent className={FLOW_NODE_CONTENT_CLASS}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <MessageSquareIcon className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-tight">{label}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{preview}</p>
            </div>
          </CardContent>
        </Card>

        {!isExiting
          ? resolvedHandles.map(({ handle, side, isBack, fraction }) => {
              const percent = `${fraction * 100}%`;
              const isVertical = side === "left" || side === "right";
              const handleStyle = isVertical ? { top: percent } : { left: percent };
              const labelStyle = handleStyle;
              const labelText = isBack
                ? `↩ ${handle.label}${backLinks[handle.id] ? ` → ${backLinks[handle.id]}` : ""}`
                : handle.label;

              const labelSideClass =
                side === "right"
                  ? "left-[calc(100%+10px)] -translate-y-1/2 whitespace-nowrap"
                  : side === "left"
                    ? "right-[calc(100%+10px)] -translate-y-1/2 whitespace-nowrap text-right"
                    : side === "top"
                      ? "bottom-full mb-1 -translate-x-1/2 max-w-24 truncate"
                      : "top-full mt-1 -translate-x-1/2 max-w-24 truncate";

              return (
                <div key={handle.id}>
                  <Handle
                    id={handle.id}
                    type="source"
                    position={SIDE_TO_POSITION[side]}
                    style={handleStyle}
                    className={cn(
                      "!size-2.5 !border-2 !border-background",
                      isBack ? "!size-2 !bg-muted-foreground/40" : "!bg-primary",
                    )}
                  />
                  <span
                    className={cn(
                      "pointer-events-none absolute text-[10px]",
                      isBack ? "text-muted-foreground/70" : "text-muted-foreground",
                      labelSideClass,
                    )}
                    style={labelStyle}
                  >
                    {labelText}
                  </span>
                </div>
              );
            })
          : null}
      </m.div>
    </LazyMotion>
  );
}
