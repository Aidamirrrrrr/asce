"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectSummary } from "@/lib/projects";

const CLOSE_ANIMATION_MS = 220;

type ProjectEditSheetProps = {
  project: ProjectSummary | null;
  onClose: () => void;
  onSaved: (project: ProjectSummary) => void;
};

export function ProjectEditSheet({ project, onClose, onSaved }: ProjectEditSheetProps) {
  const [displayProject, setDisplayProject] = useState<ProjectSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (project) {
      clearTimeout(closeTimerRef.current);
      setDisplayProject(project);
      setName(project.name);
      setDescription(project.description ?? "");
      setOpen(true);
      return;
    }

    setOpen(false);
  }, [project]);

  useEffect(() => {
    if (open || !displayProject) {
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      setDisplayProject(null);
    }, CLOSE_ANIMATION_MS);

    return () => {
      clearTimeout(closeTimerRef.current);
    };
  }, [open, displayProject]);

  useEffect(() => {
    return () => {
      clearTimeout(closeTimerRef.current);
    };
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      onClose();
    }
  }

  async function handleSave() {
    if (!displayProject || isSaving) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Укажите название проекта");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/projects/${displayProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
        }),
      });

      const data = (await response.json()) as {
        project?: ProjectSummary;
        error?: string;
      };

      if (!(response.ok && data.project)) {
        throw new Error(data.error ?? "Не удалось сохранить проект");
      }

      onSaved(data.project);
      toast.success("Проект обновлён");
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить проект");
    } finally {
      setIsSaving(false);
    }
  }

  if (!displayProject) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-80 flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="gap-1 border-b border-border p-4">
          <SheetTitle>Свойства проекта</SheetTitle>
          <SheetDescription>Название и описание отображаются в списке проектов.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="project-name">Название</FieldLabel>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isSaving}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="project-description">Описание</FieldLabel>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Кратко опишите, что делает бот"
                  className="min-h-28 resize-none"
                  disabled={isSaving}
                />
              </Field>
            </FieldGroup>
          </div>
        </ScrollArea>

        <SheetFooter className="border-t border-border p-4">
          <Button type="button" onClick={handleSave} disabled={isSaving || !name.trim()}>
            {isSaving ? (
              <>
                <Loader2Icon className="animate-spin" />
                Сохраняем...
              </>
            ) : (
              "Сохранить"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
