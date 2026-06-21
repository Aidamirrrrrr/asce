import type { EdgeTypes } from "@xyflow/react";

import { FlowBusEdge } from "@/app/_home/flow/flow-bus-edge";
import { FLOW_BUS_EDGE_TYPE } from "@/lib/flow/branch-handle-utils";

export const flowEdgeTypes: EdgeTypes = {
  [FLOW_BUS_EDGE_TYPE]: FlowBusEdge,
};
