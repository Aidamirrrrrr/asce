"use client";

import { Loader2Icon, PlayIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { AnimatedStatusBadge } from "@/app/_home/flow/animated-status-badge";
import type { BotRuntimeState } from "@/app/_home/flow/use-bot-runtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectSecretsReadiness } from "@/lib/bot/project-secrets";
import { formatRuntimeStatus } from "@/lib/projects";

type BotRuntimeStatusBadgeProps = {
  runtime: BotRuntimeState;
};

export function BotRuntimeStatusBadge({ runtime }: BotRuntimeStatusBadgeProps) {
  const { project, isLoading } = runtime;
  const runtimeStatus = project?.runtimeStatus ?? "stopped";
  const isRunning = runtimeStatus === "running";
  const hasError = runtimeStatus === "error";
  const isLoadingState = isLoading && !project;

  const show = isLoadingState || isRunning || hasError;
  const badgeKey = isLoadingState
    ? "loading"
    : isRunning
      ? "running"
      : hasError
        ? "error"
        : "hidden";

  return (
    <AnimatedStatusBadge show={show} badgeKey={badgeKey}>
      {isLoadingState ? (
        <Badge variant="secondary" className="bg-card/95 shadow-sm backdrop-blur-sm">
          <Loader2Icon className="size-3 animate-spin" />
          Загрузка…
        </Badge>
      ) : isRunning ? (
        <Badge
          variant="outline"
          className="border-emerald-500/50 bg-emerald-500/15 text-emerald-700 shadow-sm backdrop-blur-sm dark:text-emerald-300"
        >
          {formatRuntimeStatus("running")}
        </Badge>
      ) : hasError ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="destructive" className="bg-card/95 shadow-sm backdrop-blur-sm">
                {formatRuntimeStatus("error")}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {project?.lastError ?? runtime.actionError ?? "Неизвестная ошибка"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </AnimatedStatusBadge>
  );
}

type BotRunActionsProps = {
  runtime: BotRuntimeState;
  onOpenSettings: (tab?: "bot" | "secrets") => void;
};

export function BotRunActions({ runtime, onOpenSettings }: BotRunActionsProps) {
  const { project, isLoading, isStarting, isStopping, startBot, stopBot } = runtime;
  const runtimeStatus = project?.runtimeStatus ?? "stopped";
  const isRunning = runtimeStatus === "running";

  async function fetchSecretsReadiness(projectId: string): Promise<ProjectSecretsReadiness | null> {
    const response = await fetch(`/api/projects/${projectId}/secrets`);
    const data = (await response.json()) as {
      readiness?: ProjectSecretsReadiness;
      error?: string;
    };

    if (!(response.ok && data.readiness)) {
      return null;
    }

    return data.readiness;
  }

  async function handleStart() {
    if (!project?.hasBotToken) {
      toast.error("Сначала укажите токен бота в настройках");
      onOpenSettings("bot");
      return;
    }

    if (project.id) {
      const readiness = await fetchSecretsReadiness(project.id);
      if (readiness && !readiness.ready) {
        const missingLabels = readiness.missing
          .map((secret) => secret.label ?? secret.key)
          .join(", ");
        toast.error(`Заполните секреты перед запуском: ${missingLabels}`);
        onOpenSettings("secrets");
        return;
      }
    }

    try {
      await startBot();
      toast.success("Бот запущен");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось запустить бота");
    }
  }

  async function handleStop() {
    try {
      await stopBot();
      toast.success("Бот остановлен");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось остановить бота");
    }
  }

  if (isLoading && !project) {
    return null;
  }

  if (isRunning) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleStop()}
        disabled={isStopping}
        className="pointer-events-auto bg-card/95 shadow-sm backdrop-blur-sm"
      >
        {isStopping ? <Loader2Icon className="animate-spin" /> : <SquareIcon />}
        Остановить
      </Button>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={() => void handleStart()}
      disabled={isStarting}
      className="pointer-events-auto shadow-sm"
    >
      {isStarting ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
      Запустить
    </Button>
  );
}
