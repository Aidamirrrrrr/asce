"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flowEdgeTypes } from "@/app/_home/flow/edge-registry";
import { FlowInspector } from "@/app/_home/flow/flow-inspector";
import { NodeActionMenu } from "@/app/_home/flow/node-action-menu";
import { NodePalette } from "@/app/_home/flow/node-palette";
import { flowNodeTypes } from "@/app/_home/flow/node-registry";
import { useFlowEditor } from "@/app/_home/flow/use-flow-editor";
import { CANVAS_PANEL_TRANSITION_MS } from "@/app/_home/use-launcher-transition";
import {
  computeBackNavigation,
  computeSourceHandleSides,
  FLOW_BUS_EDGE_TYPE,
  withFlowBusEdgeType,
} from "@/lib/flow/branch-handle-utils";
import {
  type BotFlowDocument,
  type FlowNodeType,
  sanitizeFlowDocument,
} from "@/lib/flow/flow-schema";
import { applyAlignLayoutToFlowDocument } from "@/lib/flow/normalize-generated-flow";
import { applyInferredSecretsToFlow } from "@/lib/flow/secret-recipes";
import { collectDeclaredVariableKeys } from "@/lib/flow/set-variable-node-utils";
import { duration } from "@/lib/motion";

const STREAM_REVEAL_MS = 480;
const STREAM_STAGGER_MS = 90;
const STREAM_EDGE_LAG_MS = 140;
const STREAM_LAYOUT_MS = Math.round(duration.slow * 0.55 * 1000);

type FlowEditorProps = {
  projectId: string;
  flowDocument: BotFlowDocument;
  onDocumentChange: (doc: BotFlowDocument) => void;
  revealDelayMs?: number;
  externalDocument?: BotFlowDocument | null;
  documentRevision?: number;
  isFlowGenerating?: boolean;
  relayoutRef?: RefObject<(() => void) | null>;
};

function FlowEditorInner({
  projectId,
  flowDocument,
  onDocumentChange,
  revealDelayMs = CANVAS_PANEL_TRANSITION_MS,
  externalDocument = null,
  documentRevision = 0,
  isFlowGenerating = false,
  relayoutRef,
}: FlowEditorProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const containerRef = useRef<HTMLDivElement>(null);
  const skipChangeRef = useRef(true);
  const alignRafRef = useRef<number | null>(null);
  const hasRevealedRef = useRef(flowDocument.nodes.length > 0);
  const [revealed, setRevealed] = useState(flowDocument.nodes.length > 0);

  const focusStreamNode = useCallback(
    (nodeId: string) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fitView({
            nodes: [{ id: nodeId }],
            padding: 0.9,
            duration: Math.round(duration.slow * 0.6 * 1000),
            maxZoom: 1,
          });
        });
      });
    },
    [fitView],
  );

  const {
    nodes,
    edges,
    setNodes,
    viewport,
    inspectorNode,
    nodeActionMenu,
    onNodesChange,
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
  } = useFlowEditor(flowDocument.nodes, flowDocument.edges);

  const lastAppliedRevisionRef = useRef(0);
  const knownNodeIdsRef = useRef(new Set(flowDocument.nodes.map((node) => node.id)));
  const knownEdgeIdsRef = useRef(new Set(flowDocument.edges.map((edge) => edge.id)));
  const streamRevealTimersRef = useRef<number[]>([]);
  const streamPositionRafRef = useRef<number | null>(null);
  const generationBaselineRef = useRef<{ nodes: Set<string>; edges: Set<string> } | null>(null);
  const wasGeneratingRef = useRef(false);
  const [streamRevealedNodeIds, setStreamRevealedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [streamRevealedEdgeIds, setStreamRevealedEdgeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [streamDrawingEdgeIds, setStreamDrawingEdgeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [streamRevealIndices, setStreamRevealIndices] = useState<Map<string, number>>(
    () => new Map(),
  );
  const manualEnterIdsRef = useRef(new Set<string>());
  const [pendingEnterIds, setPendingEnterIds] = useState<Set<string>>(() => new Set());
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const metadataRef = useRef<Pick<BotFlowDocument, "secrets" | "variables">>({
    secrets: flowDocument.secrets,
    variables: flowDocument.variables,
  });

  const flowVariableKeys = useMemo(
    () => collectDeclaredVariableKeys(nodes, flowDocument.variables ?? []),
    [nodes, flowDocument.variables],
  );

  const _flowSyncSignature = useMemo(
    () =>
      [
        flowDocument.nodes.length,
        flowDocument.edges.length,
        flowDocument.edges.map((edge) => edge.id).join("\n"),
        flowDocument.nodes
          .map((node) => `${node.id}:${node.position.x},${node.position.y}`)
          .join("\n"),
      ].join("|"),
    [flowDocument],
  );

  const refreshNodeInternals = useCallback(
    (nodeIds: string[]) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          for (const nodeId of nodeIds) {
            updateNodeInternals(nodeId);
          }
        });
      });
    },
    [updateNodeInternals],
  );

  const backNavigation = useMemo(() => computeBackNavigation(nodes, edges), [nodes, edges]);
  const handleSides = useMemo(() => computeSourceHandleSides(nodes, edges), [nodes, edges]);
  // Ноды, у которых есть линейное продолжение через хендл "next" — чтобы отрисовать
  // его даже когда у сообщения есть кнопки (иначе ребро next остаётся без источника).
  const nextEdgeSourceIds = useMemo(
    () =>
      new Set(
        edges.filter((edge) => (edge.sourceHandle ?? "next") === "next").map((edge) => edge.source),
      ),
    [edges],
  );

  // Когда стороны коннекторов меняются, просим React Flow пересчитать геометрию
  // хендлов (иначе линии стартуют из старой точки). Сигнатура стабильна между
  // кадрами анимации, поэтому во время твина эффект не дёргается.
  const handleSidesSignature = useMemo(
    () =>
      [...handleSides.entries()]
        .map(([id, sides]) => `${id}:${Object.entries(sides).sort().join(",")}`)
        .sort()
        .join("|"),
    [handleSides],
  );
  // Сигнатура — намеренный триггер: не дёргаем updateNodeInternals на каждом кадре анимации.
  // biome-ignore lint/correctness/useExhaustiveDependencies: handleSides меняет ссылку каждый кадр
  useEffect(() => {
    refreshNodeInternals([...handleSides.keys()]);
  }, [handleSidesSignature, refreshNodeInternals]);

  const clearStreamRevealTimers = useCallback(() => {
    for (const timerId of streamRevealTimersRef.current) {
      window.clearTimeout(timerId);
    }
    streamRevealTimersRef.current = [];
  }, []);

  const scheduleStreamReveal = useCallback((callback: () => void, delay: number) => {
    const timerId = window.setTimeout(() => {
      streamRevealTimersRef.current = streamRevealTimersRef.current.filter((id) => id !== timerId);
      callback();
    }, delay);
    streamRevealTimersRef.current.push(timerId);
  }, []);

  const scheduleStreamReveals = useCallback(
    (
      newNodeIds: string[],
      newEdgeIds: string[],
      edges: BotFlowDocument["edges"],
    ) => {
      if (!isFlowGenerating) {
        return;
      }

      if (newNodeIds.length > 0) {
        setStreamRevealIndices((current) => {
          const next = new Map(current);
          for (const [index, nodeId] of newNodeIds.entries()) {
            next.set(nodeId, index);
          }
          return next;
        });
      }

      for (const [index, nodeId] of newNodeIds.entries()) {
        scheduleStreamReveal(() => {
          setStreamRevealedNodeIds((current) => {
            const next = new Set(current);
            next.add(nodeId);
            return next;
          });
        }, STREAM_REVEAL_MS + index * STREAM_STAGGER_MS);
      }

      for (const edgeId of newEdgeIds) {
        const edge = edges.find((item) => item.id === edgeId);
        const sourceIndex = edge ? newNodeIds.indexOf(edge.source) : -1;
        const targetIndex = edge ? newNodeIds.indexOf(edge.target) : -1;
        const anchorIndex = Math.max(sourceIndex, targetIndex, 0);
        const edgeDelay = STREAM_REVEAL_MS + anchorIndex * STREAM_STAGGER_MS + STREAM_EDGE_LAG_MS;

        scheduleStreamReveal(() => {
          setStreamDrawingEdgeIds((current) => {
            const next = new Set(current);
            next.add(edgeId);
            return next;
          });
          setStreamRevealedEdgeIds((current) => {
            const next = new Set(current);
            next.add(edgeId);
            return next;
          });
          scheduleStreamReveal(() => {
            setStreamDrawingEdgeIds((current) => {
              const next = new Set(current);
              next.delete(edgeId);
              return next;
            });
          }, Math.round(duration.normal * 1000));
        }, edgeDelay);
      }
    },
    [isFlowGenerating, scheduleStreamReveal],
  );

  const runStreamPositionTween = useCallback(
    (
      movedNodeIds: string[],
      targetPositions: Map<string, { x: number; y: number }>,
      startPositions: Map<string, { x: number; y: number }>,
    ) => {
      if (movedNodeIds.length === 0) {
        return;
      }

      if (streamPositionRafRef.current != null) {
        cancelAnimationFrame(streamPositionRafRef.current);
      }

      const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
      const startedAt = performance.now();

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / STREAM_LAYOUT_MS);
        const k = easeOutCubic(progress);

        setNodes((prev) =>
          prev.map((node) => {
            if (!movedNodeIds.includes(node.id)) {
              return node;
            }

            const target = targetPositions.get(node.id);
            const start = startPositions.get(node.id);
            if (!(target && start)) {
              return node;
            }

            return {
              ...node,
              position: {
                x: start.x + (target.x - start.x) * k,
                y: start.y + (target.y - start.y) * k,
              },
            };
          }),
        );

        if (progress < 1) {
          streamPositionRafRef.current = requestAnimationFrame(tick);
          return;
        }

        streamPositionRafRef.current = null;
      };

      streamPositionRafRef.current = requestAnimationFrame(tick);
    },
    [setNodes],
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((node, index) => ({
        ...node,
        data: {
          ...node.data,
          isEntering: !isFlowGenerating && (pendingEnterIds.has(node.id) || !revealed),
          streamReveal: isFlowGenerating && !streamRevealedNodeIds.has(node.id),
          revealIndex:
            streamRevealIndices.get(node.id) ??
            (manualEnterIdsRef.current.has(node.id) ? 0 : index),
          isDragging: node.id === draggingNodeId,
          backLinks: backNavigation.backLinksByNode.get(node.id),
          handleSides: handleSides.get(node.id),
          hasNextEdge: nextEdgeSourceIds.has(node.id),
        },
      })),
    [
      nodes,
      pendingEnterIds,
      revealed,
      isFlowGenerating,
      streamRevealedNodeIds,
      streamRevealIndices,
      draggingNodeId,
      backNavigation,
      handleSides,
      nextEdgeSourceIds,
    ],
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge, index) => {
        const isBack = backNavigation.backEdgeIds.has(edge.id);
        const streamPending =
          isFlowGenerating &&
          !streamRevealedEdgeIds.has(edge.id) &&
          !streamDrawingEdgeIds.has(edge.id) &&
          !isBack;

        return {
          ...withFlowBusEdgeType(edge),
          data: {
            ...edge.data,
            streamReveal: streamDrawingEdgeIds.has(edge.id),
            streamRevealDelay: 0,
          },
          style: {
            ...edge.style,
            opacity: isBack ? 0 : streamPending ? 0 : isFlowGenerating || revealed ? 1 : 0,
            pointerEvents: isBack ? ("none" as const) : undefined,
            transition:
              !(isBack || isFlowGenerating) && revealed
                ? `opacity ${duration.slow}s ease ${0.12 + index * 0.05}s`
                : undefined,
          },
          interactionWidth: isBack ? 0 : undefined,
        };
      }),
    [
      edges,
      revealed,
      isFlowGenerating,
      streamRevealedEdgeIds,
      streamDrawingEdgeIds,
      backNavigation,
    ],
  );

  useEffect(() => {
    if (!isFlowGenerating) {
      clearStreamRevealTimers();
      generationBaselineRef.current = null;
      setStreamRevealedNodeIds(new Set());
      setStreamRevealedEdgeIds(new Set());
      setStreamDrawingEdgeIds(new Set());
      setStreamRevealIndices(new Map());
      return;
    }

    if (generationBaselineRef.current) {
      return;
    }

    generationBaselineRef.current = {
      nodes: new Set(knownNodeIdsRef.current),
      edges: new Set(knownEdgeIdsRef.current),
    };
    setStreamRevealedNodeIds(new Set(generationBaselineRef.current.nodes));
    setStreamRevealedEdgeIds(new Set(generationBaselineRef.current.edges));
    setStreamDrawingEdgeIds(new Set());
  }, [clearStreamRevealTimers, isFlowGenerating]);

  useEffect(() => {
    if (wasGeneratingRef.current && !isFlowGenerating && nodes.length > 0) {
      requestAnimationFrame(() => {
        fitView({
          padding: 0.25,
          duration: Math.round(duration.slow * 1000),
        });
      });
    }
    wasGeneratingRef.current = isFlowGenerating;
  }, [fitView, isFlowGenerating, nodes.length]);

  useEffect(() => {
    if (
      !externalDocument ||
      documentRevision === 0 ||
      documentRevision === lastAppliedRevisionRef.current
    ) {
      return;
    }

    lastAppliedRevisionRef.current = documentRevision;
    skipChangeRef.current = true;

    const newIds = externalDocument.nodes
      .map((node) => node.id)
      .filter((id) => !knownNodeIdsRef.current.has(id));
    const newEdgeIds = externalDocument.edges
      .map((edge) => edge.id)
      .filter((id) => !knownEdgeIdsRef.current.has(id));

    metadataRef.current = {
      secrets: externalDocument.secrets ?? metadataRef.current.secrets,
      variables: externalDocument.variables ?? metadataRef.current.variables,
    };

    if (newIds.length > 0 && !isFlowGenerating) {
      setPendingEnterIds(new Set(newIds));
    }

    const startPositions = new Map(
      nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
    );
    const targetPositions = new Map(
      externalDocument.nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
    );
    const movedNodeIds = externalDocument.nodes
      .filter((node) => {
        const start = startPositions.get(node.id);
        if (!start) {
          return false;
        }
        const target = targetPositions.get(node.id);
        if (!target) {
          return false;
        }
        return start.x !== target.x || start.y !== target.y;
      })
      .map((node) => node.id);

    replaceDocument(externalDocument.nodes, externalDocument.edges, externalDocument.viewport);

    if (isFlowGenerating) {
      scheduleStreamReveals(newIds, newEdgeIds, externalDocument.edges);
      if (movedNodeIds.length > 0) {
        runStreamPositionTween(movedNodeIds, targetPositions, startPositions);
      }
    }

    knownNodeIdsRef.current = new Set(externalDocument.nodes.map((node) => node.id));
    knownEdgeIdsRef.current = new Set(externalDocument.edges.map((edge) => edge.id));
    refreshNodeInternals(externalDocument.nodes.map((node) => node.id));

    requestAnimationFrame(() => {
      skipChangeRef.current = false;

      if (newIds.length > 0 && !isFlowGenerating) {
        requestAnimationFrame(() => {
          setPendingEnterIds(new Set());
        });
      }

      if (isFlowGenerating && newIds.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: guarded by newIds.length > 0 above
        const latestNodeId = newIds[newIds.length - 1]!;
        focusStreamNode(latestNodeId);
      } else if (!isFlowGenerating) {
        fitView({
          padding: 0.25,
          duration: Math.round(duration.slow * 1000),
        });
      }
    });
  }, [
    documentRevision,
    externalDocument,
    fitView,
    focusStreamNode,
    isFlowGenerating,
    nodes,
    replaceDocument,
    refreshNodeInternals,
    runStreamPositionTween,
    scheduleStreamReveals,
  ]);

  // После генерации (и при загрузке сохранённого сценария) синхронизируем проп
  // с внутренним состоянием React Flow — иначе рёбра от «поздних» связей не рисуются.
  useEffect(() => {
    if (isFlowGenerating) {
      return;
    }

    skipChangeRef.current = true;
    replaceDocument(flowDocument.nodes, flowDocument.edges);
    knownNodeIdsRef.current = new Set(flowDocument.nodes.map((node) => node.id));
    knownEdgeIdsRef.current = new Set(flowDocument.edges.map((edge) => edge.id));
    lastAppliedRevisionRef.current = documentRevision;
    refreshNodeInternals(flowDocument.nodes.map((node) => node.id));

    requestAnimationFrame(() => {
      skipChangeRef.current = false;
    });
  }, [documentRevision, flowDocument, isFlowGenerating, replaceDocument, refreshNodeInternals]);

  useEffect(() => {
    if (!isFlowGenerating) {
      return;
    }

    hasRevealedRef.current = true;
    setRevealed(true);
  }, [isFlowGenerating]);

  useEffect(() => {
    skipChangeRef.current = true;
    requestAnimationFrame(() => {
      skipChangeRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (isFlowGenerating || hasRevealedRef.current || nodes.length === 0) {
      return;
    }

    const root = containerRef.current;
    if (!root) {
      return;
    }

    let minDelayPassed = revealDelayMs === 0;
    let stableTimer: number | undefined;
    let minDelayTimer: number | undefined;

    const runFitView = () => {
      if (hasRevealedRef.current) {
        return;
      }

      const flowElement = root.querySelector(".react-flow");
      if (!flowElement) {
        return;
      }

      const { width, height } = flowElement.getBoundingClientRect();
      if (width < 200 || height < 200) {
        return;
      }

      hasRevealedRef.current = true;
      setRevealed(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fitView({
            padding: 0.25,
            duration: Math.round(duration.slow * 1000),
          });
        });
      });
    };

    const scheduleFitView = () => {
      if (!minDelayPassed || hasRevealedRef.current) {
        return;
      }

      window.clearTimeout(stableTimer);
      stableTimer = window.setTimeout(runFitView, 200);
    };

    minDelayTimer = window.setTimeout(() => {
      minDelayPassed = true;
      scheduleFitView();
    }, revealDelayMs);

    const observer = new ResizeObserver(scheduleFitView);
    observer.observe(root);

    return () => {
      observer.disconnect();
      window.clearTimeout(stableTimer);
      window.clearTimeout(minDelayTimer);
    };
  }, [fitView, isFlowGenerating, nodes.length, revealDelayMs]);

  useEffect(() => {
    if (skipChangeRef.current) {
      return;
    }

    const doc = applyInferredSecretsToFlow(
      sanitizeFlowDocument({
        nodes,
        edges,
        viewport,
        secrets: metadataRef.current.secrets,
        variables: metadataRef.current.variables,
      }),
    );

    metadataRef.current.secrets = doc.secrets ?? metadataRef.current.secrets;
    onDocumentChange(doc);
  }, [nodes, edges, viewport, onDocumentChange]);

  function handleAddNode(type: FlowNodeType) {
    const bounds = document.querySelector(".react-flow")?.getBoundingClientRect();
    const centerX = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2;
    const centerY = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2;

    const newId = addNode(type, screenToFlowPosition({ x: centerX, y: centerY }));

    // Монтируем ноду невидимой, затем на следующем кадре снимаем флаг —
    // она плавно проявляется (fade + scale). revealIndex=0 → без задержки.
    manualEnterIdsRef.current.add(newId);
    setPendingEnterIds((prev) => new Set(prev).add(newId));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPendingEnterIds((prev) => {
          const next = new Set(prev);
          next.delete(newId);
          return next;
        });
      });
    });
  }

  const handleRelayout = useCallback(() => {
    if (nodes.length === 0) {
      return;
    }

    const laidOut = applyAlignLayoutToFlowDocument(
      sanitizeFlowDocument({
        nodes,
        edges,
        viewport,
        secrets: metadataRef.current.secrets,
        variables: metadataRef.current.variables,
      }),
    );

    const targets = new Map(laidOut.nodes.map((node) => [node.id, node.position]));
    const starts = new Map(
      nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
    );

    if (alignRafRef.current != null) {
      cancelAnimationFrame(alignRafRef.current);
    }

    // Плавно интерполируем позиции через setNodes — рёбра пересчитываются каждый
    // кадр и едут вместе с нодами. Коммит документа делаем один раз в конце.
    const durationMs = Math.round(duration.slow * 1000);
    const startedAt = performance.now();
    const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

    skipChangeRef.current = true;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const k = easeOutCubic(progress);

      setNodes((prev) =>
        prev.map((node) => {
          const target = targets.get(node.id);
          const start = starts.get(node.id);
          if (!(target && start)) {
            return node;
          }
          return {
            ...node,
            position: {
              x: start.x + (target.x - start.x) * k,
              y: start.y + (target.y - start.y) * k,
            },
          };
        }),
      );

      if (progress < 1) {
        alignRafRef.current = requestAnimationFrame(tick);
        return;
      }

      alignRafRef.current = null;
      skipChangeRef.current = false;
      replaceDocument(laidOut.nodes, laidOut.edges, viewport);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fitView({ padding: 0.25, duration: durationMs });
        });
      });
    };

    alignRafRef.current = requestAnimationFrame(tick);
  }, [nodes, edges, viewport, replaceDocument, fitView, setNodes]);

  useEffect(() => {
    return () => {
      clearStreamRevealTimers();
      if (alignRafRef.current != null) {
        cancelAnimationFrame(alignRafRef.current);
      }
      if (streamPositionRafRef.current != null) {
        cancelAnimationFrame(streamPositionRafRef.current);
      }
    };
  }, [clearStreamRevealTimers]);

  useEffect(() => {
    if (!relayoutRef) {
      return;
    }

    relayoutRef.current = handleRelayout;
    return () => {
      relayoutRef.current = null;
    };
  }, [relayoutRef, handleRelayout]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={flowNodeTypes}
        edgeTypes={flowEdgeTypes}
        defaultEdgeOptions={{ type: FLOW_BUS_EDGE_TYPE }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMoveEnd={onMoveEnd}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={(_, node) => setDraggingNodeId(node.id)}
        onNodeDragStop={() => setDraggingNodeId(null)}
        nodesDraggable={revealed && !isFlowGenerating}
        nodesConnectable={revealed && !isFlowGenerating}
        elementsSelectable={revealed && !isFlowGenerating}
        deleteKeyCode={revealed && !isFlowGenerating ? ["Backspace", "Delete"] : null}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} className="!shadow-md" />
      </ReactFlow>

      <NodePalette onAddNode={handleAddNode} />

      <NodeActionMenu
        menu={nodeActionMenu}
        onOpenChange={(open) => {
          if (!open) {
            closeNodeActionMenu();
          }
        }}
        onOpenSettings={openInspector}
        onDelete={deleteNode}
      />

      <FlowInspector
        projectId={projectId}
        node={inspectorNode}
        flowVariableKeys={flowVariableKeys}
        onUpdate={updateNodeData}
        onClose={closeInspector}
      />
    </div>
  );
}

export function FlowEditor(props: FlowEditorProps) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export type { FlowEditorProps };
