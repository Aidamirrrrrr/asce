"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createEmptyFlow } from "@/lib/flow/default-flow";
import { type BotFlowDocument, parseFlowJson, serializeFlowJson } from "@/lib/flow/flow-schema";
import { applyLayoutToFlowDocument } from "@/lib/flow/normalize-generated-flow";
import { applyInferredSecretsToFlow } from "@/lib/flow/secret-recipes";

export type FlowSaveStatus = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 1200;

/**
 * Раскладку НЕ пересчитываем автоматически — сохранённые позиции нод уважаются.
 * Авто-раскладка применяется только если позиции отсутствуют/вырождены
 * (все ноды в одной точке, например после миграции старого формата).
 */
function ensureNodePositions(doc: BotFlowDocument): BotFlowDocument {
  if (doc.nodes.length <= 1) {
    return doc;
  }

  const first = doc.nodes[0]?.position;
  const allSamePosition = doc.nodes.every(
    (node) => node.position.x === first.x && node.position.y === first.y,
  );

  return allSamePosition ? applyLayoutToFlowDocument(doc) : doc;
}

/** Раскладка при загрузке, если все ноды в одной точке. */
function prepareLoadedDocument(doc: BotFlowDocument): BotFlowDocument {
  return ensureNodePositions(doc);
}

export function useFlowPersistence(projectId: string) {
  const [saveStatus, setSaveStatus] = useState<FlowSaveStatus>("idle");
  const [initialDocument, setInitialDocument] = useState<BotFlowDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDocRef = useRef<BotFlowDocument | null>(null);
  const isMountedRef = useRef(true);

  const saveDocument = useCallback(
    async (doc: BotFlowDocument, { silent = false }: { silent?: boolean } = {}) => {
      if (!isMountedRef.current) {
        return false;
      }

      setSaveStatus("saving");

      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flowJson: serializeFlowJson(applyInferredSecretsToFlow(doc)),
          }),
        });

        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Не удалось сохранить сценарий");
        }

        if (isMountedRef.current) {
          setSaveStatus("saved");
          pendingDocRef.current = null;
        }

        return true;
      } catch (saveError) {
        if (isMountedRef.current) {
          setSaveStatus("error");
          if (!silent) {
            toast.error(
              saveError instanceof Error ? saveError.message : "Не удалось сохранить сценарий",
            );
          }
        }
        return false;
      }
    },
    [projectId],
  );

  const queueSave = useCallback(
    (doc: BotFlowDocument) => {
      pendingDocRef.current = doc;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        if (pendingDocRef.current) {
          void saveDocument(pendingDocRef.current);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [saveDocument],
  );

  const flushSave = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (pendingDocRef.current) {
      await saveDocument(pendingDocRef.current, { silent: true });
    }
  }, [saveDocument]);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function loadProject() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/projects/${projectId}`);
        const data = (await response.json()) as {
          project?: { flowJson?: string | null };
          error?: string;
        };

        if (!(response.ok && data.project)) {
          throw new Error(data.error ?? "Проект не найден");
        }

        const document = prepareLoadedDocument(
          parseFlowJson(data.project.flowJson, createEmptyFlow()),
        );

        if (!cancelled) {
          setInitialDocument(document);
          setIsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить проект");
          setIsLoading(false);
        }
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      void flushSave();
    };
  }, [flushSave]);

  const syncDocument = useCallback((doc: BotFlowDocument) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    pendingDocRef.current = null;
    setSaveStatus("idle");
    setInitialDocument(prepareLoadedDocument(doc));
  }, []);

  return {
    initialDocument,
    isLoading,
    error,
    saveStatus,
    queueSave,
    flushSave,
    syncDocument,
  };
}
