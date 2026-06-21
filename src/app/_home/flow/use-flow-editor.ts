"use client";

import {
  addEdge,
  type Connection,
  type NodeChange,
  type NodeRemoveChange,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { NodeActionMenuState } from "@/app/_home/flow/node-action-menu";
import { FLOW_BUS_EDGE_TYPE } from "@/lib/flow/branch-handle-utils";
import { isValidSourceHandle } from "@/lib/flow/condition-node-utils";
import {
  createDefaultNodeData,
  createFlowNodeId,
  type FlowEdge,
  type FlowNode,
  type FlowNodeData,
  type FlowNodeTransientData,
  type FlowNodeType,
  type FlowViewport,
  pruneInvalidMessageEdges,
} from "@/lib/flow/flow-schema";
import { duration } from "@/lib/motion";

const DELETE_ANIMATION_MS = Math.round(duration.normal * 1000);

export function useFlowEditor(initialNodes: FlowNode[], initialEdges: FlowEdge[]) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [viewport, setViewport] = useState<FlowViewport | undefined>(undefined);
  const [inspectorNode, setInspectorNode] = useState<FlowNode | null>(null);
  const [nodeActionMenu, setNodeActionMenu] = useState<NodeActionMenuState | null>(null);
  const deletingNodeIdsRef = useRef<Set<string>>(new Set());
  const deleteTimersRef = useRef<Map<string, number>>(new Map());

  const clearPendingDeletes = useCallback(() => {
    for (const timer of deleteTimersRef.current.values()) {
      clearTimeout(timer);
    }

    deleteTimersRef.current.clear();
    deletingNodeIdsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      clearPendingDeletes();
    };
  }, [clearPendingDeletes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      if (sourceNode && !isValidSourceHandle(sourceNode, connection.sourceHandle)) {
        return;
      }

      setEdges((currentEdges) =>
        addEdge({ ...connection, type: FLOW_BUS_EDGE_TYPE }, currentEdges),
      );
    },
    [nodes, setEdges],
  );

  const onMoveEnd = useCallback((_event: unknown, nextViewport: FlowViewport) => {
    setViewport(nextViewport);
  }, []);

  const onNodeClick = useCallback((event: React.MouseEvent, node: FlowNode) => {
    setNodeActionMenu({
      node,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setNodeActionMenu(null);
  }, []);

  const closeNodeActionMenu = useCallback(() => {
    setNodeActionMenu(null);
  }, []);

  const openInspector = useCallback((node: FlowNode) => {
    setNodeActionMenu(null);
    setInspectorNode(node);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorNode(null);
  }, []);

  const finalizeDelete = useCallback(
    (nodeId: string) => {
      deletingNodeIdsRef.current.delete(nodeId);
      deleteTimersRef.current.delete(nodeId);

      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) =>
        current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
      setInspectorNode((current) => (current?.id === nodeId ? null : current));
    },
    [setEdges, setNodes],
  );

  const requestDeleteNode = useCallback(
    (nodeId: string) => {
      if (deletingNodeIdsRef.current.has(nodeId)) {
        return;
      }

      deletingNodeIdsRef.current.add(nodeId);
      setNodeActionMenu(null);
      setInspectorNode((current) => (current?.id === nodeId ? null : current));

      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                selected: false,
                data: { ...node.data, isExiting: true } as FlowNodeData & FlowNodeTransientData,
              }
            : node,
        ),
      );

      setEdges((current) =>
        current.map((edge) =>
          edge.source === nodeId || edge.target === nodeId
            ? { ...edge, className: "flow-edge-exiting" }
            : edge,
        ),
      );

      const timer = window.setTimeout(() => {
        finalizeDelete(nodeId);
      }, DELETE_ANIMATION_MS);

      deleteTimersRef.current.set(nodeId, timer);
    },
    [finalizeDelete, setEdges, setNodes],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const removals = changes.filter(
        (change): change is NodeRemoveChange => change.type === "remove",
      );
      const otherChanges = changes.filter((change) => change.type !== "remove");

      if (otherChanges.length > 0) {
        onNodesChange(otherChanges);
      }

      for (const removal of removals) {
        requestDeleteNode(removal.id);
      }
    },
    [onNodesChange, requestDeleteNode],
  );

  const deleteNode = requestDeleteNode;

  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<FlowNode["data"]>) => {
      setNodes((current) => {
        const nextNodes = current.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node,
        );

        setEdges((currentEdges) => pruneInvalidMessageEdges(nextNodes, currentEdges));

        return nextNodes;
      });

      setInspectorNode((current) =>
        current?.id === nodeId ? { ...current, data: { ...current.data, ...data } } : current,
      );

      setNodeActionMenu((current) =>
        current?.node.id === nodeId
          ? { ...current, node: { ...current.node, data: { ...current.node.data, ...data } } }
          : current,
      );
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    if (inspectorNode && !nodes.some((node) => node.id === inspectorNode.id)) {
      setInspectorNode(null);
    }
  }, [nodes, inspectorNode]);

  const addNode = useCallback(
    (type: FlowNodeType, position: { x: number; y: number }) => {
      const newNode: FlowNode = {
        id: createFlowNodeId(type),
        type,
        position,
        data: createDefaultNodeData(type),
      };

      setNodes((current) => [...current, newNode]);
      return newNode.id;
    },
    [setNodes],
  );

  const replaceDocument = useCallback(
    (nextNodes: FlowNode[], nextEdges: FlowEdge[], nextViewport?: FlowViewport) => {
      clearPendingDeletes();
      setNodes(nextNodes);
      setEdges(nextEdges);
      if (nextViewport !== undefined) {
        setViewport(nextViewport);
      }
      setInspectorNode(null);
      setNodeActionMenu(null);
    },
    [clearPendingDeletes, setEdges, setNodes],
  );

  return {
    nodes,
    edges,
    setNodes,
    viewport,
    inspectorNode,
    nodeActionMenu,
    onNodesChange: handleNodesChange,
    onEdgesChange,
    onConnect,
    onMoveEnd,
    onNodeClick,
    onPaneClick,
    closeNodeActionMenu,
    openInspector,
    closeInspector,
    deleteNode,
    addNode,
    updateNodeData,
    replaceDocument,
  };
}
