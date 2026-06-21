"use client";

import { Loader2Icon } from "lucide-react";
import { domAnimation, LazyMotion, m } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ProjectCard } from "@/app/_home/project-card";
import { ProjectEditSheet } from "@/app/_home/project-edit-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { duration, gentleEase } from "@/lib/motion";
import type { ProjectSummary } from "@/lib/projects";
import { cn } from "@/lib/utils";

const projectCardMotionVariants = {
  visible: { opacity: 1, y: 0, scale: 1 },
  exiting: {
    opacity: 0,
    y: -8,
    scale: 0.94,
    transition: { duration: duration.normal, ease: gentleEase },
  },
} as const;

function areProjectListsEqual(a: ProjectSummary[], b: ProjectSummary[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every(
    (project, index) => project.id === b[index]?.id && project.updatedAt === b[index]?.updatedAt,
  );
}

function mergeGridProjects(
  current: ProjectSummary[],
  nextVisible: ProjectSummary[],
  exitingIds: ReadonlySet<string>,
): ProjectSummary[] {
  const base = nextVisible.filter((project) => !exitingIds.has(project.id));
  const exiting = current.filter((project) => exitingIds.has(project.id));
  const merged = [...base];

  for (const project of exiting) {
    if (!merged.some((item) => item.id === project.id)) {
      merged.push(project);
    }
  }

  return merged;
}

type ProjectGridProps = {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
  onProjectUpdated: (project: ProjectSummary) => void;
  onProjectDeleted: (projectId: string) => void;
  maxItems?: number;
  columnMode?: "auto" | "single";
  defaultColumnCount?: number;
  reserveGridSpace?: boolean;
};

export function ProjectGrid({
  projects,
  activeProjectId,
  onSelect,
  onProjectUpdated,
  onProjectDeleted,
  maxItems,
  columnMode = "auto",
  defaultColumnCount,
  reserveGridSpace = false,
}: ProjectGridProps) {
  const visibleProjects = useMemo(
    () => (maxItems != null ? projects.slice(0, maxItems) : projects),
    [projects, maxItems],
  );

  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [gridProjects, setGridProjects] = useState<ProjectSummary[]>(visibleProjects);
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set());
  const [collapsePlaceholderHeight, setCollapsePlaceholderHeight] = useState<number | null>(null);
  const pendingDeleteIdRef = useRef<string | null>(null);
  const exitingIdsRef = useRef<Set<string>>(new Set());

  // The launcher panel animates its width (flex-grow) when the canvas opens/closes.
  // With a CSS `auto-fill` grid, the column count is recomputed by the browser as a
  // continuous, React-invisible event, so cards snap to new rows mid-animation and
  // framer-motion cannot tween the reflow. We instead derive the same column count
  // ourselves from the container width and drive it via state, so each change is a
  // React commit that motion's `layout` can animate smoothly.
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState<number | null>(defaultColumnCount ?? null);

  useEffect(() => {
    let addedIds: string[] = [];

    setGridProjects((current) => {
      const merged = mergeGridProjects(current, visibleProjects, exitingIdsRef.current);
      if (areProjectListsEqual(current, merged)) {
        return current;
      }

      const previousIds = new Set(current.map((project) => project.id));
      addedIds = merged
        .filter((project) => !previousIds.has(project.id))
        .map((project) => project.id);

      return merged;
    });

    if (addedIds.length > 0) {
      setEnteringIds((previous) => {
        const next = new Set(previous);
        for (const id of addedIds) {
          next.add(id);
        }
        return next;
      });
    }
  }, [visibleProjects]);

  useEffect(() => {
    if (!reserveGridSpace) {
      setCollapsePlaceholderHeight(null);
    }
  }, [reserveGridSpace]);

  function clearEnteringId(projectId: string) {
    setEnteringIds((previous) => {
      if (!previous.has(projectId)) {
        return previous;
      }

      const next = new Set(previous);
      next.delete(projectId);
      return next;
    });
  }

  function handleItemExitComplete(projectId: string) {
    if (!exitingIdsRef.current.has(projectId)) {
      return;
    }

    exitingIdsRef.current.delete(projectId);
    setExitingIds((previous) => {
      if (!previous.has(projectId)) {
        return previous;
      }

      const next = new Set(previous);
      next.delete(projectId);
      return next;
    });

    const nextVisible =
      maxItems != null
        ? projects.filter((project) => project.id !== projectId).slice(0, maxItems)
        : projects.filter((project) => project.id !== projectId);

    const isPendingDelete = pendingDeleteIdRef.current === projectId;
    const placeholderHeight =
      isPendingDelete && nextVisible.length === 0 && gridRef.current
        ? gridRef.current.offsetHeight
        : null;

    let addedIds: string[] = [];

    setGridProjects((current) => {
      const withoutExited = current.filter((project) => project.id !== projectId);
      const merged = mergeGridProjects(withoutExited, nextVisible, exitingIdsRef.current);

      const previousIds = new Set(withoutExited.map((project) => project.id));
      addedIds = merged
        .filter((project) => !previousIds.has(project.id))
        .map((project) => project.id);

      return merged;
    });

    if (addedIds.length > 0) {
      setEnteringIds((previous) => {
        const next = new Set(previous);
        for (const id of addedIds) {
          next.add(id);
        }
        return next;
      });
    }

    if (pendingDeleteIdRef.current === projectId) {
      if (placeholderHeight != null) {
        setCollapsePlaceholderHeight(placeholderHeight);
      }

      pendingDeleteIdRef.current = null;
      onProjectDeleted(projectId);
    }
  }

  useEffect(() => {
    if (columnMode === "single") {
      setColumnCount(1);
      return;
    }

    const element = gridRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const width = element.clientWidth;
      if (width === 0) {
        return;
      }

      const styles = getComputedStyle(element);
      const gap = parseFloat(styles.columnGap) || 16;
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const minCardWidth = 18 * rootFontSize; // matches `minmax(min(100%, 18rem), 1fr)`

      const computed =
        width < minCardWidth ? 1 : Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));

      if (defaultColumnCount != null) {
        const minWidthForDefault =
          defaultColumnCount * minCardWidth + gap * (defaultColumnCount - 1);

        if (width < 200) {
          return;
        }

        // Keep preview cards on one row (3+0), or stack to a single column — never 2+1.
        const next = width >= minWidthForDefault ? defaultColumnCount : 1;
        setColumnCount((current) => (current === next ? current : next));
        return;
      }

      setColumnCount((current) => (current === computed ? current : computed));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [columnMode, defaultColumnCount]);

  async function handleConfirmDelete() {
    if (!deletingProject || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/projects/${deletingProject.id}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не удалось удалить проект");
      }

      const deletedId = deletingProject.id;
      pendingDeleteIdRef.current = deletedId;
      exitingIdsRef.current.add(deletedId);
      setExitingIds((previous) => {
        const next = new Set(previous);
        next.add(deletedId);
        return next;
      });
      toast.success("Проект удалён");
      setDeletingProject(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить проект");
    } finally {
      setIsDeleting(false);
    }
  }

  if (gridProjects.length === 0 && visibleProjects.length === 0) {
    if (reserveGridSpace && collapsePlaceholderHeight != null) {
      return <div aria-hidden className="min-h-0" style={{ height: collapsePlaceholderHeight }} />;
    }

    return null;
  }

  return (
    <>
      <LazyMotion features={domAnimation}>
        <div
          ref={gridRef}
          className={cn(
            "-mx-1 grid gap-4 overflow-visible px-1 py-0.5",
            defaultColumnCount == null
              ? "grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]"
              : undefined,
          )}
          style={
            columnCount != null
              ? { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }
              : undefined
          }
        >
          {gridProjects.map((project) => {
            const isEntering = enteringIds.has(project.id);
            const isExiting = exitingIds.has(project.id);
            const isLastCardExit = isExiting && gridProjects.length === 1;

            return (
              <m.div
                key={project.id}
                layout={isExiting ? false : "position"}
                initial={isEntering ? { opacity: 0, y: 10, scale: 0.98 } : false}
                animate={isExiting ? "exiting" : "visible"}
                variants={projectCardMotionVariants}
                transition={{
                  duration: isLastCardExit ? duration.fast : duration.normal,
                  ease: gentleEase,
                  layout: { duration: duration.normal, ease: gentleEase },
                }}
                onAnimationComplete={(definition) => {
                  if (definition === "exiting" && exitingIdsRef.current.has(project.id)) {
                    handleItemExitComplete(project.id);
                    return;
                  }

                  if (isEntering) {
                    clearEnteringId(project.id);
                  }
                }}
                className={cn("min-w-0", isExiting && "pointer-events-none")}
              >
                <ProjectCard
                  project={project}
                  isActive={activeProjectId === project.id}
                  onSelect={onSelect}
                  onEdit={setEditingProject}
                  onDelete={setDeletingProject}
                />
              </m.div>
            );
          })}
        </div>
      </LazyMotion>

      <ProjectEditSheet
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSaved={(project) => {
          onProjectUpdated(project);
          setEditingProject(null);
        }}
      />

      <AlertDialog
        open={Boolean(deletingProject)}
        onOpenChange={(open) => {
          if (!(open || isDeleting)) {
            setDeletingProject(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить проект?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingProject
                ? `«${deletingProject.name}» и его сценарий будут удалены без возможности восстановления.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  Удаляем...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
