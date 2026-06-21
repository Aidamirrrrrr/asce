"use client";

import { BaseEdge, type EdgeProps, getBezierPath, Position } from "@xyflow/react";

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
}: EdgeProps) {
  const edgePath = getFlowBusPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke: "var(--foreground)",
        strokeOpacity: 0.4,
        strokeWidth: selected ? 2.5 : 2,
      }}
      interactionWidth={24}
    />
  );
}
