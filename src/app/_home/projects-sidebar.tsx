"use client";

import {
  BotIcon,
  Loader2Icon,
  MenuIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FeedbackDialog } from "@/app/_home/feedback-dialog";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GradientText } from "@/components/ui/gradient-text";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ProjectSummary } from "@/lib/projects";

type ProjectsSidebarProps = {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
  onProjectUpdated: (project: ProjectSummary) => void;
  onProjectDeleted: (projectId: string) => void;
};

function closeSidebar(
  isMobile: boolean,
  setOpen: (open: boolean) => void,
  setOpenMobile: (open: boolean) => void,
) {
  if (isMobile) {
    setOpenMobile(false);
  } else {
    setOpen(false);
  }
}

export function ProjectsSidebarTrigger() {
  const { toggleSidebar } = useSidebar();

  return (
    <Button variant="outline" size="icon" onClick={toggleSidebar} aria-label="Все проекты">
      <MenuIcon className="size-4" />
    </Button>
  );
}

export function ProjectsSidebar({
  projects,
  activeProjectId,
  onSelect,
  onProjectUpdated,
  onProjectDeleted,
}: ProjectsSidebarProps) {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleSelect(projectId: string) {
    onSelect(projectId);
    closeSidebar(isMobile, setOpen, setOpenMobile);
  }

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

      onProjectDeleted(deletingProject.id);
      toast.success("Проект удалён");
      setDeletingProject(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить проект");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex flex-col gap-1 px-2 py-1">
            <GradientText className="font-heading font-semibold text-base tracking-tight">
              asce
            </GradientText>
            <p className="text-xs text-muted-foreground">
              {projects.length > 0 ? `Все проекты · ${projects.length} шт.` : "Все проекты"}
            </p>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Проекты</SidebarGroupLabel>
            <SidebarGroupContent>
              {projects.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">Проектов пока нет</p>
              ) : (
                <SidebarMenu>
                  {projects.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton
                        isActive={activeProjectId === project.id}
                        onClick={() => handleSelect(project.id)}
                      >
                        <BotIcon />
                        <span className="truncate">{project.name}</span>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction
                            showOnHover
                            aria-label={`Действия для «${project.name}»`}
                          >
                            <MoreHorizontalIcon />
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-[110] w-48">
                          <DropdownMenuItem onClick={() => handleSelect(project.id)}>
                            <WorkflowIcon />
                            Редактировать схему
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingProject(project)}>
                            <SettingsIcon />
                            Свойства проекта
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeletingProject(project)}
                          >
                            <Trash2Icon />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-sidebar-border border-t">
          <FeedbackDialog />
        </SidebarFooter>
      </Sidebar>

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
