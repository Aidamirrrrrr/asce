"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

import { duration } from "@/lib/motion";

export const LAUNCHER_TRANSITION_MS = Math.round(duration.slow * 1000);
export const PROJECTS_TRANSITION_MS = LAUNCHER_TRANSITION_MS;
export const CANVAS_PANEL_TRANSITION_MS = 350;

export type LauncherLayoutMode = "launcher" | "chat";

type UseLauncherTransitionOptions = {
  activeProjectId: string | null;
  isMobile: boolean;
  openProject: (projectId: string) => void;
  closeProject: () => void;
  canvasPanelRef: React.RefObject<PanelImperativeHandle | null>;
};

export function useLauncherTransition({
  activeProjectId,
  isMobile,
  openProject,
  closeProject,
  canvasPanelRef,
}: UseLauncherTransitionOptions) {
  const isOrchestratingRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const [layoutMode, setLayoutMode] = useState<LauncherLayoutMode>(
    activeProjectId && !isMobile ? "chat" : "launcher",
  );
  const [showProjects, setShowProjects] = useState(!activeProjectId);
  const [showChat, setShowChat] = useState(Boolean(activeProjectId && !isMobile));
  const [canvasProjectId, setCanvasProjectId] = useState<string | null>(activeProjectId);
  const [isPanelTransitioning, setIsPanelTransitioning] = useState(false);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!activeProjectId) {
      setShowChat(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (activeProjectId) {
      setCanvasProjectId(activeProjectId);
      return;
    }

    const timer = window.setTimeout(() => {
      setCanvasProjectId(null);
    }, CANVAS_PANEL_TRANSITION_MS);

    return () => window.clearTimeout(timer);
  }, [activeProjectId]);

  useEffect(() => {
    if (isMobile || isOrchestratingRef.current) {
      return;
    }

    const canvasPanel = canvasPanelRef.current;
    if (!canvasPanel) {
      return;
    }

    if (activeProjectId) {
      if (!canvasPanel.isCollapsed()) {
        return;
      }

      setIsPanelTransitioning(true);
      canvasPanel.resize("55%");

      const timer = window.setTimeout(() => {
        setIsPanelTransitioning(false);
      }, CANVAS_PANEL_TRANSITION_MS);

      return () => window.clearTimeout(timer);
    }

    if (canvasPanel.isCollapsed()) {
      return;
    }

    setIsPanelTransitioning(true);
    canvasPanel.collapse();

    const timer = window.setTimeout(() => {
      setIsPanelTransitioning(false);
    }, CANVAS_PANEL_TRANSITION_MS);

    return () => window.clearTimeout(timer);
  }, [activeProjectId, isMobile, canvasPanelRef]);

  const expandCanvas = useCallback(() => {
    const canvasPanel = canvasPanelRef.current;
    if (!canvasPanel?.isCollapsed()) {
      return;
    }

    setIsPanelTransitioning(true);
    canvasPanel.resize("55%");
    schedule(() => setIsPanelTransitioning(false), CANVAS_PANEL_TRANSITION_MS);
  }, [canvasPanelRef, schedule]);

  const collapseCanvas = useCallback(() => {
    const canvasPanel = canvasPanelRef.current;
    if (!canvasPanel || canvasPanel.isCollapsed()) {
      return;
    }

    setIsPanelTransitioning(true);
    canvasPanel.collapse();
    schedule(() => setIsPanelTransitioning(false), CANVAS_PANEL_TRANSITION_MS);
  }, [canvasPanelRef, schedule]);

  const requestOpenProject = useCallback(
    (projectId: string) => {
      if (isMobile) {
        openProject(projectId);
        return;
      }

      if (isOrchestratingRef.current) {
        return;
      }

      if (activeProjectId === projectId) {
        return;
      }

      isOrchestratingRef.current = true;
      clearTimers();

      setShowProjects(false);
      setShowChat(false);
      setLayoutMode("chat");

      schedule(() => {
        openProject(projectId);
        expandCanvas();

        schedule(() => {
          setShowChat(true);
          isOrchestratingRef.current = false;
        }, CANVAS_PANEL_TRANSITION_MS);
      }, PROJECTS_TRANSITION_MS);
    },
    [isMobile, openProject, activeProjectId, clearTimers, schedule, expandCanvas],
  );

  const requestCloseProject = useCallback(() => {
    if (isMobile) {
      closeProject();
      return;
    }

    if (isOrchestratingRef.current || !activeProjectId) {
      return;
    }

    isOrchestratingRef.current = true;
    clearTimers();

    setShowChat(false);
    collapseCanvas();

    schedule(() => {
      setLayoutMode("launcher");
      setShowProjects(true);

      schedule(() => {
        closeProject();
        isOrchestratingRef.current = false;
      }, PROJECTS_TRANSITION_MS);
    }, CANVAS_PANEL_TRANSITION_MS);
  }, [isMobile, closeProject, activeProjectId, clearTimers, schedule, collapseCanvas]);

  const isProjectOpen = layoutMode === "chat" || (isMobile && Boolean(activeProjectId));

  return {
    layoutMode,
    showProjects,
    showChat,
    canvasProjectId,
    isPanelTransitioning,
    isProjectOpen,
    requestOpenProject,
    requestCloseProject,
  };
}
