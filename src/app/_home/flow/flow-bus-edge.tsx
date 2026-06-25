"use client";

import { BaseEdge, type EdgeProps, getBezierPath, Position } from "@xyflow/react";
import { domAnimation, LazyMotion, m } from "motion/react";

import { duration, gentleEase } from "@/lib/motion";
import type { FlowEdgeTransientData } from "@/lib/flow/flow-schema";

/** Базовая кривизна безье; обратные рёбра выгибаем сильнее, чтобы не резали узлы. */
const FLOW_BUS_CURVATURE = 0.3;
const FLOW_BUS_BACKWARD_CURVATURE = 0.6;

function getFlowBusPath(props: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: EdgeProps["sourcePosition"];
  targetPosition: EdgeProps["targetPosition"];
}): string {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const isBackward = targetX < sourceX - 24;

  return getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePosition ?? Position.Right,
    targetX,
    targetY,
    targetPosition: targetPosition ?? Position.Left,
    curvature: isBackward ? FLOW_BUS_BACKWARD_CURVATURE : FLOW_BUS_CURVATURE,
  })[0];
}

export function FlowBusEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const edgeData = data as FlowEdgeTransientData | undefined;
  const streamReveal = edgeData?.streamReveal === true;
  const streamRevealDelay = edgeData?.streamRevealDelay ?? 0;

  const edgePath = getFlowBusPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const strokeWidth = selected ? 2.5 : 2;

  if (streamReveal) {
    return (
      <LazyMotion features={domAnimation}>
        <m.g>
          <m.path
            d={edgePath}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={strokeWidth}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.4 }}
            transition={{
              duration: duration.normal,
              ease: gentleEase,
              delay: streamRevealDelay,
            }}
          />
        </m.g>
      </LazyMotion>
    );
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke: "var(--foreground)",
        strokeOpacity: 0.4,
        strokeWidth,
      }}
      interactionWidth={24}
    />
  );
}
