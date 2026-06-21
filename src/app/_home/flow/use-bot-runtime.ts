"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ProjectSummary } from "@/lib/projects";

const POLL_INTERVAL_MS = 5000;

export function useBotRuntime(projectId: string) {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}`);
    const data = (await response.json()) as {
      project?: ProjectSummary;
      error?: string;
    };

    if (response.ok && data.project) {
      setProject(data.project);
      return data.project;
    }

    throw new Error(data.error ?? "Не удалось загрузить статус бота");
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        await refresh();
      } catch {
        if (!cancelled) {
          setProject(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    pollTimerRef.current = setInterval(() => {
      void refresh().catch(() => undefined);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollTimerRef.current);
    };
  }, [refresh]);

  async function startBot() {
    setIsStarting(true);
    setActionError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/start`, { method: "POST" });
      const data = (await response.json()) as {
        project?: ProjectSummary;
        error?: string;
      };

      if (!(response.ok && data.project)) {
        throw new Error(data.error ?? "Не удалось запустить бота");
      }

      setProject(data.project);
      return data.project;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось запустить бота";
      setActionError(message);
      await refresh().catch(() => undefined);
      throw error;
    } finally {
      setIsStarting(false);
    }
  }

  async function stopBot() {
    setIsStopping(true);
    setActionError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/stop`, { method: "POST" });
      const data = (await response.json()) as {
        project?: ProjectSummary;
        error?: string;
      };

      if (!(response.ok && data.project)) {
        throw new Error(data.error ?? "Не удалось остановить бота");
      }

      setProject(data.project);
      return data.project;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось остановить бота";
      setActionError(message);
      throw error;
    } finally {
      setIsStopping(false);
    }
  }

  return {
    project,
    isLoading,
    isStarting,
    isStopping,
    actionError,
    refresh,
    startBot,
    stopBot,
  };
}

export type BotRuntimeState = ReturnType<typeof useBotRuntime>;
