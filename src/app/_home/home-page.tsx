"use client";

import { AnimatePresence, domAnimation, LazyMotion, m } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { toast } from "sonner";
import { CanvasLoadingPlaceholder, FlowCanvasPanel } from "@/app/_home/flow/flow-canvas-panel";
import { ProjectChatPanel } from "@/app/_home/project-chat-panel";
import { ProjectGrid } from "@/app/_home/project-grid";
import { ProjectsSidebar, ProjectsSidebarTrigger } from "@/app/_home/projects-sidebar";
import { PromptComposer, type PromptComposerHandle } from "@/app/_home/prompt-composer";
import {
  type LauncherLayoutMode,
  useLauncherTransition,
} from "@/app/_home/use-launcher-transition";
import { ThemeToggle } from "@/components/theme-toggle";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  STREAMING_BUILD_PLAN_MESSAGE_ID,
  upsertStreamingBuildPlanMessage,
} from "@/lib/chat/build-plan-message";
import {
  removeStreamingAssistantMessage,
  STREAMING_ASSISTANT_MESSAGE_ID,
  upsertStreamingAssistantMessage,
} from "@/lib/chat/streaming-assistant-message";
import { createStreamingSeedFlow } from "@/lib/flow/default-flow";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { duration, gentleEase } from "@/lib/motion";
import type { ProjectChatMessage, ProjectSummary } from "@/lib/projects";
import { createChatMessage } from "@/lib/projects";
import { cn } from "@/lib/utils";

type HomePageProps = {
  initialProjects: ProjectSummary[];
};

const chatPanelTransition = {
  duration: duration.normal,
  ease: gentleEase,
};

const chatPanelVariants = {
  visible: {
    opacity: 1,
    y: 0,
    transition: chatPanelTransition,
  },
  hidden: {
    opacity: 0,
    y: 12,
    transition: { duration: duration.fast, ease: gentleEase },
  },
};

import { LAUNCHER_PROJECTS_PREVIEW_COUNT } from "@/app/_home/launcher-config";

const projectsSectionCollapseDuration = 0.42;

function LauncherContent({
  projects,
  activeProjectId,
  layoutMode,
  showProjects,
  showChat,
  chatMessages,
  onProjectCreated,
  onProjectRefined,
  onSelectProject,
  onProjectUpdated,
  onProjectDeleted,
  onGenerationStart,
  onGenerationEnd,
  onGenerationCancel,
  onStreamStarted,
  onStreamFlow,
  onStreamIntent,
  onStreamPlan,
  onStreamPlanProgress,
  onStreamProgress,
  onStreamStatus,
  onStreamAssistantDelta,
  onStreamAssistantReset,
  isChatBusy,
  composerRef,
  onContinueAgent,
  onActionCard,
  onChatRollback,
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  layoutMode: LauncherLayoutMode;
  showProjects: boolean;
  showChat: boolean;
  chatMessages: ProjectChatMessage[];
  onProjectCreated: (result: {
    project: ProjectSummary;
    messages?: ProjectChatMessage[];
    flow?: BotFlowDocument;
  }) => void;
  onProjectRefined: (result: {
    project: ProjectSummary;
    assistantMessage: string;
    messages: ProjectChatMessage[];
    flow?: BotFlowDocument;
    flowUpdated?: boolean;
  }) => void;
  onSelectProject: (projectId: string) => void;
  onProjectUpdated: (project: ProjectSummary) => void;
  onProjectDeleted: (projectId: string) => void;
  onGenerationStart: (userMessage: string) => void;
  onGenerationEnd: () => void;
  onGenerationCancel: () => void;
  onStreamStarted: (project: ProjectSummary) => void;
  onStreamFlow: (flow: BotFlowDocument) => void;
  onStreamIntent: (intent: "flow" | "data" | "chat") => void;
  onStreamPlan: (items: string[]) => void;
  onStreamPlanProgress: (done: number[]) => void;
  onStreamProgress: (nodeCount: number) => void;
  onStreamStatus: (message: string) => void;
  onStreamAssistantDelta: (delta: string) => void;
  onStreamAssistantReset: () => void;
  isChatBusy: boolean;
  composerRef: RefObject<PromptComposerHandle | null>;
  onContinueAgent: () => void;
  onActionCard: (messageId: string, actionId: string) => void;
  onChatRollback: (messageId: string) => Promise<void>;
}) {
  const isChatLayout = layoutMode === "chat";
  const [sectionShellOpen, setSectionShellOpen] = useState(projects.length > 0);
  const [projectsSectionDismissed, setProjectsSectionDismissed] = useState(false);
  const [projectsGridExpanded, setProjectsGridExpanded] = useState(projects.length > 0);
  const isCollapsingAfterLastDelete = sectionShellOpen && projects.length === 0;
  const isHidingProjectsForChat =
    sectionShellOpen && !showProjects && projects.length > 0 && !projectsSectionDismissed;
  const showProjectsShell =
    sectionShellOpen &&
    !projectsSectionDismissed &&
    (showProjects || isHidingProjectsForChat || isCollapsingAfterLastDelete);
  const centerLauncherPrompt = !(isChatLayout || sectionShellOpen);
  const activeProject =
    activeProjectId != null
      ? (projects.find((project) => project.id === activeProjectId) ?? null)
      : null;

  useEffect(() => {
    if (projects.length > 0) {
      setSectionShellOpen(true);
    }
  }, [projects.length]);

  useEffect(() => {
    if (!showProjects || isChatLayout || projects.length === 0 || !projectsSectionDismissed) {
      return;
    }

    setProjectsSectionDismissed(false);
  }, [showProjects, isChatLayout, projects.length, projectsSectionDismissed]);

  useEffect(() => {
    if (isHidingProjectsForChat || isCollapsingAfterLastDelete) {
      setProjectsGridExpanded(false);
    }
  }, [isHidingProjectsForChat, isCollapsingAfterLastDelete]);

  useEffect(() => {
    if (
      !showProjectsShell ||
      isHidingProjectsForChat ||
      isCollapsingAfterLastDelete ||
      projectsGridExpanded
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setProjectsGridExpanded(true);
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    showProjectsShell,
    isHidingProjectsForChat,
    isCollapsingAfterLastDelete,
    projectsGridExpanded,
  ]);

  return (
    <LazyMotion features={domAnimation}>
      <div
        className={cn(
          "@container/launcher mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col px-4 sm:px-6",
          isChatLayout && "overflow-hidden",
        )}
      >
        <m.div
          className={cn(
            "flex flex-col",
            isChatLayout ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 shrink-0",
          )}
          animate={{ flexGrow: 1 }}
          transition={{ duration: duration.slow, ease: gentleEase }}
          style={{ flexGrow: 1 }}
        >
          <AnimatePresence initial={false}>
            {showChat && activeProject ? (
              <m.div
                key={`chat-${activeProject.id}`}
                className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={chatPanelVariants}
              >
                <ProjectChatPanel
                  project={activeProject}
                  messages={chatMessages}
                  onContinueAgent={onContinueAgent}
                  isContinueDisabled={isChatBusy}
                  onActionCard={onActionCard}
                  onRollback={onChatRollback}
                  isRollbackDisabled={isChatBusy}
                />
              </m.div>
            ) : null}
          </AnimatePresence>
        </m.div>

        <div className={cn("shrink-0", isChatLayout && "mx-auto w-full max-w-3xl")}>
          <PromptComposer
            ref={composerRef}
            onCreated={onProjectCreated}
            onRefined={onProjectRefined}
            onGenerationStart={onGenerationStart}
            onGenerationEnd={onGenerationEnd}
            onGenerationCancel={onGenerationCancel}
            onStreamStarted={onStreamStarted}
            onStreamFlow={onStreamFlow}
            onStreamIntent={onStreamIntent}
            onStreamPlan={onStreamPlan}
            onStreamPlanProgress={onStreamPlanProgress}
            onStreamProgress={onStreamProgress}
            onStreamStatus={onStreamStatus}
            onStreamAssistantDelta={onStreamAssistantDelta}
            onStreamAssistantReset={onStreamAssistantReset}
            projectId={activeProjectId}
            variant={isChatLayout ? "chat" : "launcher"}
          />
        </div>

        {showProjectsShell ? (
          <div
            className={cn(
              "grid shrink-0 transition-[grid-template-rows,opacity,margin-top]",
              projectsGridExpanded ? "mt-8 opacity-100" : "mt-0 opacity-0",
            )}
            style={{
              gridTemplateRows: projectsGridExpanded ? "1fr" : "0fr",
              transitionDuration: `${projectsSectionCollapseDuration}s`,
              transitionTimingFunction: `cubic-bezier(${gentleEase.join(",")})`,
            }}
            onTransitionEnd={(event) => {
              if (event.propertyName !== "grid-template-rows" || projectsGridExpanded) {
                return;
              }

              if (isCollapsingAfterLastDelete) {
                setSectionShellOpen(false);
                return;
              }

              if (isHidingProjectsForChat) {
                setProjectsSectionDismissed(true);
              }
            }}
          >
            <div
              className={cn(
                "min-h-0",
                projectsGridExpanded ? "overflow-visible" : "overflow-hidden",
              )}
            >
              <section className="space-y-4">
                <div className="space-y-1">
                  <h2 className="font-heading text-xl font-medium">Последние проекты</h2>
                  <p className="text-sm text-muted-foreground">
                    {projects.length > LAUNCHER_PROJECTS_PREVIEW_COUNT
                      ? `Последние ${LAUNCHER_PROJECTS_PREVIEW_COUNT} из ${projects.length} — все проекты в меню слева.`
                      : "Откройте проект, чтобы увидеть холст со сценарием справа."}
                  </p>
                </div>
                <ProjectGrid
                  projects={projects}
                  activeProjectId={activeProjectId}
                  maxItems={LAUNCHER_PROJECTS_PREVIEW_COUNT}
                  defaultColumnCount={LAUNCHER_PROJECTS_PREVIEW_COUNT}
                  reserveGridSpace={!projectsGridExpanded}
                  onSelect={onSelectProject}
                  onProjectUpdated={onProjectUpdated}
                  onProjectDeleted={onProjectDeleted}
                />
              </section>
            </div>
          </div>
        ) : null}

        <m.div
          className="min-h-0 shrink-0"
          animate={{ flexGrow: isChatLayout ? 0 : centerLauncherPrompt ? 1 : 0.5 }}
          transition={{
            duration: centerLauncherPrompt ? projectsSectionCollapseDuration : duration.slow,
            ease: gentleEase,
          }}
          style={{ flexGrow: isChatLayout ? 0 : centerLauncherPrompt ? 1 : 0.5 }}
        />
      </div>
    </LazyMotion>
  );
}

function DesktopLayoutShell({
  isProjectOpen,
  launcher,
  canvas,
}: {
  isProjectOpen: boolean;
  launcher: React.ReactNode;
  canvas: React.ReactNode;
}) {
  if (!isProjectOpen) {
    return <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">{launcher}</div>;
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1">
      <div className="flex h-full min-h-0 min-w-0 basis-[45%] flex-col">{launcher}</div>
      <div className="w-px shrink-0 bg-border" aria-hidden />
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">{canvas}</div>
    </div>
  );
}

function LauncherScroll({
  children,
  contained = false,
  compactTop = false,
}: {
  children: React.ReactNode;
  contained?: boolean;
  compactTop?: boolean;
}) {
  const [expandedTopPadding, setExpandedTopPadding] = useState(56);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const updatePadding = () => {
      setExpandedTopPadding(mediaQuery.matches ? 64 : 56);
    };

    updatePadding();
    mediaQuery.addEventListener("change", updatePadding);
    return () => mediaQuery.removeEventListener("change", updatePadding);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <LazyMotion features={domAnimation}>
        <m.div
          className={cn(
            "flex h-full min-h-0 flex-col pb-4",
            contained ? "overflow-hidden" : "overflow-y-auto",
          )}
          initial={false}
          animate={{ paddingTop: compactTop ? 16 : expandedTopPadding }}
          transition={{ duration: duration.slow, ease: gentleEase }}
        >
          {children}
        </m.div>
      </LazyMotion>
    </div>
  );
}

function LauncherFloatingToolbar({ isProjectOpen }: { isProjectOpen: boolean }) {
  const { open, isMobile } = useSidebar();

  return (
    <div
      className={cn(
        "fixed top-4 z-50 flex items-center gap-2 transition-[left,opacity] duration-200 ease-linear sm:top-6",
        isProjectOpen && "pointer-events-none opacity-0",
        isMobile || !open
          ? "left-4 sm:left-6"
          : "left-[calc(var(--sidebar-width)+1rem)] sm:left-[calc(var(--sidebar-width)+1.5rem)]",
      )}
    >
      <ProjectsSidebarTrigger />
      <ThemeToggle />
    </div>
  );
}

export function HomePage({ initialProjects }: HomePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  const [projects, setProjects] = useState(initialProjects);
  const [chatMessages, setChatMessages] = useState<ProjectChatMessage[]>([]);
  const [flowDocumentRevision, setFlowDocumentRevision] = useState(0);
  const [externalFlowDocument, setExternalFlowDocument] = useState<BotFlowDocument | null>(null);
  const [committedFlowDocument, setCommittedFlowDocument] = useState<BotFlowDocument | null>(null);
  const [isFlowGenerating, setIsFlowGenerating] = useState(false);
  const [isChatBusy, setIsChatBusy] = useState(false);
  const [streamingProjectId, setStreamingProjectId] = useState<string | null>(null);
  const activeProjectId = searchParams.get("project");
  const [isDesktopLayoutReady, setIsDesktopLayoutReady] = useState(false);
  const skipCanvasRevealDelay = useRef(Boolean(activeProjectId));
  const preserveFlowDuringGenerationRef = useRef(false);
  const streamingUserMessageRef = useRef<string | null>(null);
  const canvasPanelRef = useRef<PanelImperativeHandle>(null);
  const composerRef = useRef<PromptComposerHandle>(null);

  useEffect(() => {
    skipCanvasRevealDelay.current = false;
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsDesktopLayoutReady(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  const openProject = useCallback(
    (projectId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("project", projectId);
      router.replace(`/?${params.toString()}`);
    },
    [router, searchParams],
  );

  const closeProject = useCallback(() => {
    router.replace("/");
  }, [router]);

  const {
    layoutMode,
    showProjects,
    showChat,
    canvasProjectId,
    isPanelTransitioning,
    isProjectOpen,
    requestOpenProject,
    requestCloseProject,
  } = useLauncherTransition({
    activeProjectId,
    isMobile,
    openProject,
    closeProject,
    canvasPanelRef,
  });

  const applyStreamingSeed = useCallback(() => {
    setExternalFlowDocument(createStreamingSeedFlow());
    setFlowDocumentRevision((current) => current + 1);
  }, []);

  const handleGenerationEnd = useCallback(() => {
    setIsChatBusy(false);
    setIsFlowGenerating(false);
    setExternalFlowDocument(null);
    setStreamingProjectId(null);
    streamingUserMessageRef.current = null;
    preserveFlowDuringGenerationRef.current = false;
  }, []);

  const handleStreamStatus = useCallback((message: string) => {
    setChatMessages((current) =>
      upsertStreamingBuildPlanMessage(current, { statusLabel: message }),
    );
  }, []);

  const handleStreamAssistantDelta = useCallback((delta: string) => {
    setChatMessages((current) => {
      const withoutBuildPlan = current.filter(
        (message) => message.id !== STREAMING_BUILD_PLAN_MESSAGE_ID,
      );
      return upsertStreamingAssistantMessage(withoutBuildPlan, { append: delta });
    });
  }, []);

  const handleStreamAssistantReset = useCallback(() => {
    setChatMessages((current) => {
      const withoutAssistant = removeStreamingAssistantMessage(current);
      return upsertStreamingBuildPlanMessage(withoutAssistant, { statusLabel: "Ищу данные…" });
    });
  }, []);

  const handleStreamPlan = useCallback((items: string[]) => {
    setChatMessages((current) =>
      upsertStreamingBuildPlanMessage(current, { items, done: [], nodeCount: 0 }),
    );
  }, []);

  const handleStreamPlanProgress = useCallback((done: number[]) => {
    setChatMessages((current) => upsertStreamingBuildPlanMessage(current, { done }));
  }, []);

  const handleStreamProgress = useCallback((nodeCount: number) => {
    setChatMessages((current) => upsertStreamingBuildPlanMessage(current, { nodeCount }));
  }, []);

  const handleGenerationCancel = useCallback(() => {
    setChatMessages((current) =>
      current.filter(
        (message) =>
          message.id !== "streaming-user" &&
          message.id !== STREAMING_BUILD_PLAN_MESSAGE_ID &&
          message.id !== STREAMING_ASSISTANT_MESSAGE_ID,
      ),
    );
  }, []);

  const handleProjectCreated = useCallback(
    (result: {
      project: ProjectSummary;
      messages?: ProjectChatMessage[];
      flow?: BotFlowDocument;
      flowUpdated?: boolean;
    }) => {
      setProjects((current) => [
        result.project,
        ...current.filter((item) => item.id !== result.project.id),
      ]);
      if (result.messages) {
        setChatMessages(result.messages);
      }
      if (result.flow && (result.flowUpdated ?? true)) {
        setCommittedFlowDocument(result.flow);
      }
      requestOpenProject(result.project.id);
    },
    [requestOpenProject],
  );

  const handleStreamFlow = useCallback((flow: BotFlowDocument) => {
    setExternalFlowDocument(flow);
    setFlowDocumentRevision((current) => current + 1);
  }, []);

  const handleStreamStarted = useCallback(
    (project: ProjectSummary) => {
      setIsChatBusy(true);
      setIsFlowGenerating(true);
      setStreamingProjectId(project.id);
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      applyStreamingSeed();
      const userMessage = streamingUserMessageRef.current?.trim() || project.prompt?.trim() || "";
      setChatMessages([
        ...(userMessage ? [createChatMessage("user", userMessage)] : []),
        ...upsertStreamingBuildPlanMessage([], { statusLabel: "Генерируем сценарий…" }),
      ]);
      requestOpenProject(project.id);
    },
    [applyStreamingSeed, requestOpenProject],
  );

  const handleStreamIntent = useCallback(
    (intent: "flow" | "data" | "chat") => {
      if (intent === "flow") {
        setIsFlowGenerating(true);
        if (!preserveFlowDuringGenerationRef.current) {
          applyStreamingSeed();
        }
        setChatMessages((current) =>
          removeStreamingAssistantMessage(
            upsertStreamingBuildPlanMessage(current, { statusLabel: "Обновляем сценарий…" }),
          ),
        );
        return;
      }

      setChatMessages((current) =>
        removeStreamingAssistantMessage(
          upsertStreamingBuildPlanMessage(current, {
            statusLabel: intent === "data" ? "Ищу данные…" : "Думаю…",
          }),
        ),
      );
    },
    [applyStreamingSeed],
  );

  const handleGenerationStart = useCallback(
    (
      userMessage: string,
      options?: { silent?: boolean; forceFlow?: boolean; preserveFlow?: boolean },
    ) => {
      preserveFlowDuringGenerationRef.current = options?.preserveFlow === true;
      streamingUserMessageRef.current = userMessage;
      setIsChatBusy(true);
      if (activeProjectId) {
        setStreamingProjectId(activeProjectId);
      }

      if (options?.forceFlow || options?.silent) {
        setIsFlowGenerating(true);
        if (!preserveFlowDuringGenerationRef.current) {
          applyStreamingSeed();
        }
      }

      if (activeProjectId) {
        setChatMessages((current) => {
          let next = current;

          if (!options?.silent) {
            const hasOptimisticUser = current.some((message) => message.id === "streaming-user");
            if (!hasOptimisticUser) {
              next = [...next, createChatMessage("user", userMessage, "streaming-user")];
            }
          }

          next = removeStreamingAssistantMessage(next);
          next = upsertStreamingBuildPlanMessage(next, {
            statusLabel: options?.silent
              ? "Продолжаем сборку…"
              : options?.forceFlow
                ? "Обновляем сценарий…"
                : "Думаю…",
          });

          return next;
        });
      }
    },
    [activeProjectId, applyStreamingSeed],
  );

  const handleContinueAgent = useCallback(() => {
    void composerRef.current?.continueAgent();
  }, []);

  const handleActionCard = useCallback(
    async (messageId: string, actionId: string) => {
      if (!activeProjectId) {
        return;
      }

      try {
        const response = await fetch(`/api/projects/${activeProjectId}/chat-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, actionId }),
        });

        const data = (await response.json()) as {
          messages?: ProjectChatMessage[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Не удалось выполнить действие");
        }

        if (data.messages) {
          setChatMessages(data.messages);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось выполнить действие");
      }
    },
    [activeProjectId],
  );

  const handleChatRollback = useCallback(
    async (messageId: string) => {
      if (!activeProjectId) {
        throw new Error("Проект не выбран");
      }

      const response = await fetch(`/api/projects/${activeProjectId}/chat-rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });

      const data = (await response.json()) as {
        project?: ProjectSummary;
        messages?: ProjectChatMessage[];
        flow?: BotFlowDocument;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не удалось откатить");
      }

      if (data.project) {
        setProjects((current) =>
          current.map((item) => (item.id === data.project?.id ? data.project : item)),
        );
      }

      if (data.messages) {
        setChatMessages(data.messages);
      }

      if (data.flow) {
        setCommittedFlowDocument(data.flow);
        setExternalFlowDocument(null);
        setFlowDocumentRevision((current) => current + 1);
      }
    },
    [activeProjectId],
  );

  const handleProjectUpdated = useCallback((project: ProjectSummary) => {
    setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
  }, []);

  const handleProjectRefined = useCallback(
    (result: {
      project: ProjectSummary;
      assistantMessage: string;
      messages: ProjectChatMessage[];
      flow?: BotFlowDocument;
      flowUpdated?: boolean;
    }) => {
      setProjects((current) =>
        current.map((item) => (item.id === result.project.id ? result.project : item)),
      );
      setChatMessages(result.messages);
      if (result.flow && (result.flowUpdated ?? true)) {
        setCommittedFlowDocument(result.flow);
      }
    },
    [],
  );

  useEffect(() => {
    setFlowDocumentRevision(0);
    setExternalFlowDocument(null);
    setCommittedFlowDocument(null);
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      setChatMessages([]);
      return;
    }

    if (streamingProjectId === activeProjectId && isChatBusy) {
      return;
    }

    let cancelled = false;

    async function loadChat() {
      try {
        const response = await fetch(`/api/projects/${activeProjectId}`);
        const data = (await response.json()) as {
          project?: {
            messages?: ProjectChatMessage[];
          };
          error?: string;
        };

        if (!cancelled && response.ok && data.project) {
          if (data.project.messages) {
            setChatMessages(data.project.messages);
          }
        }
      } catch {
        if (!cancelled) {
          setChatMessages([]);
        }
      }
    }

    void loadChat();

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, isChatBusy, streamingProjectId]);

  const handleProjectDeleted = useCallback(
    (projectId: string) => {
      if (streamingProjectId === projectId) {
        composerRef.current?.cancelGeneration({ silent: true });
      }

      setProjects((current) => current.filter((item) => item.id !== projectId));

      if (activeProjectId === projectId) {
        requestCloseProject();
      }
    },
    [activeProjectId, requestCloseProject, streamingProjectId],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && activeProjectId) {
        requestCloseProject();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeProjectId, requestCloseProject]);

  const launcherContent = (
    <LauncherContent
      projects={projects}
      activeProjectId={activeProjectId}
      layoutMode={layoutMode}
      showProjects={showProjects}
      showChat={showChat}
      chatMessages={chatMessages}
      onProjectCreated={handleProjectCreated}
      onProjectRefined={handleProjectRefined}
      onSelectProject={requestOpenProject}
      onProjectUpdated={handleProjectUpdated}
      onProjectDeleted={handleProjectDeleted}
      onGenerationStart={handleGenerationStart}
      onGenerationEnd={handleGenerationEnd}
      onGenerationCancel={handleGenerationCancel}
      onStreamStarted={handleStreamStarted}
      onStreamFlow={handleStreamFlow}
      onStreamIntent={handleStreamIntent}
      onStreamPlan={handleStreamPlan}
      onStreamPlanProgress={handleStreamPlanProgress}
      onStreamProgress={handleStreamProgress}
      onStreamStatus={handleStreamStatus}
      onStreamAssistantDelta={handleStreamAssistantDelta}
      onStreamAssistantReset={handleStreamAssistantReset}
      isChatBusy={isChatBusy}
      composerRef={composerRef}
      onContinueAgent={handleContinueAgent}
      onActionCard={handleActionCard}
      onChatRollback={handleChatRollback}
    />
  );

  const desktopLauncher = (
    <LauncherScroll contained={isProjectOpen} compactTop={layoutMode === "chat"}>
      {launcherContent}
    </LauncherScroll>
  );

  const desktopCanvas = canvasProjectId ? (
    <FlowCanvasPanel
      key={canvasProjectId}
      projectId={canvasProjectId}
      preferImmediateReveal={skipCanvasRevealDelay.current}
      externalDocument={externalFlowDocument}
      documentRevision={flowDocumentRevision}
      isFlowGenerating={isFlowGenerating}
      committedDocument={committedFlowDocument}
      onClose={requestCloseProject}
    />
  ) : (
    <CanvasLoadingPlaceholder />
  );

  return (
    <SidebarProvider defaultOpen={false} className="min-h-svh w-full min-w-0">
      <ProjectsSidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={requestOpenProject}
        onProjectUpdated={handleProjectUpdated}
        onProjectDeleted={handleProjectDeleted}
      />

      <SidebarInset className="relative flex h-svh min-w-0 w-full flex-1 basis-0 flex-col overflow-hidden bg-background">
        <LauncherFloatingToolbar isProjectOpen={isProjectOpen} />

        <div className="flex h-full min-h-0 flex-1 flex-col">
          {isMobile ? (
            <div className="h-full min-h-0 flex-1">
              <LauncherScroll contained={isProjectOpen} compactTop={layoutMode === "chat"}>
                {launcherContent}
              </LauncherScroll>
            </div>
          ) : !isDesktopLayoutReady ? (
            <DesktopLayoutShell
              isProjectOpen={isProjectOpen}
              launcher={desktopLauncher}
              canvas={<CanvasLoadingPlaceholder />}
            />
          ) : (
            <ResizablePanelGroup
              orientation="horizontal"
              className="h-full min-h-0 flex-1"
              {...(isPanelTransitioning ? { "data-panel-transition": "" } : {})}
            >
              <ResizablePanel
                id="launcher"
                defaultSize={isProjectOpen ? 45 : 100}
                minSize={30}
                className="flex h-full min-h-0 min-w-0 flex-col"
              >
                {desktopLauncher}
              </ResizablePanel>

              <ResizableHandle
                withHandle
                className={cn(
                  "transition-opacity duration-[350ms] ease-linear",
                  !canvasProjectId && "pointer-events-none opacity-0",
                )}
              />

              <ResizablePanel
                id="canvas"
                panelRef={canvasPanelRef}
                collapsible
                collapsedSize={0}
                defaultSize={isProjectOpen ? 55 : 0}
                minSize={35}
                className="flex h-full min-h-0 min-w-0 flex-col"
              >
                {canvasProjectId ? desktopCanvas : null}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>

        {isMobile && canvasProjectId ? (
          <Sheet
            open={Boolean(activeProjectId)}
            onOpenChange={(open) => {
              if (!open) {
                requestCloseProject();
              }
            }}
          >
            <SheetContent
              side="right"
              className="w-full gap-0 p-0 sm:max-w-lg"
              showCloseButton={false}
            >
              <FlowCanvasPanel
                projectId={canvasProjectId}
                externalDocument={externalFlowDocument}
                documentRevision={flowDocumentRevision}
                isFlowGenerating={isFlowGenerating}
                committedDocument={committedFlowDocument}
                onClose={requestCloseProject}
              />
            </SheetContent>
          </Sheet>
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  );
}
