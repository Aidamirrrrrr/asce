"use client";

import {
  Clock3Icon,
  MoreHorizontalIcon,
  SettingsIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatProjectStatus, formatRuntimeStatus, type ProjectSummary } from "@/lib/projects";
import { cn } from "@/lib/utils";

type ProjectCardProps = {
  project: ProjectSummary;
  isActive: boolean;
  onSelect: (projectId: string) => void;
  onEdit: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
};

function formatRelativeDate(date: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function ProjectCard({ project, isActive, onSelect, onEdit, onDelete }: ProjectCardProps) {
  const description = project.description ?? project.prompt ?? "Без описания";

  return (
    <Card
      className={cn(
        "relative h-full ring-2 transition-shadow duration-200 hover:shadow-md",
        isActive ? "ring-primary/40" : "ring-transparent",
      )}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-xl"
        onClick={() => onSelect(project.id)}
        aria-label={`Открыть проект «${project.name}»`}
      />

      <CardHeader className="relative z-10 pointer-events-none">
        <CardTitle className="line-clamp-2 pr-2">{project.name}</CardTitle>
        <CardAction className="pointer-events-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={`Действия для «${project.name}»`}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[110] w-48">
              <DropdownMenuLabel className="truncate">{project.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  onSelect(project.id);
                }}
              >
                <WorkflowIcon />
                Редактировать схему
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onEdit(project);
                }}
              >
                <SettingsIcon />
                Свойства проекта
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  onDelete(project);
                }}
              >
                <Trash2Icon />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
        <div className="flex flex-wrap gap-2">
          <Badge className="w-fit" variant={project.status === "active" ? "default" : "secondary"}>
            {formatProjectStatus(project.status)}
          </Badge>
          {project.runtimeStatus === "error" ? (
            <Badge className="w-fit" variant="destructive">
              {formatRuntimeStatus("error")}
            </Badge>
          ) : null}
        </div>
        <CardDescription className="line-clamp-3">{description}</CardDescription>
      </CardHeader>

      <CardFooter className="relative z-10 pointer-events-none">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3Icon className="size-3.5" />
          Обновлён {formatRelativeDate(project.updatedAt)}
        </div>
      </CardFooter>
    </Card>
  );
}
