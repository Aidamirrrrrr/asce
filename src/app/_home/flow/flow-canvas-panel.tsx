"use client";

import { LayoutGridIcon, SettingsIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BotSettingsSheet } from "@/app/_home/bot-settings-sheet";
import { AnimatedStatusBadge } from "@/app/_home/flow/animated-status-badge";
import { BotRunActions, BotRuntimeStatusBadge } from "@/app/_home/flow/bot-run-controls";
import { FlowEditor } from "@/app/_home/flow/flow-canvas";
import { useBotRuntime } from "@/app/_home/flow/use-bot-runtime";
import { type FlowSaveStatus, useFlowPersistence } from "@/app/_home/flow/use-flow-persistence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isStreamingSeedFlow } from "@/lib/flow/default-flow";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";

type FlowCanvasPanelContentProps = {
  projectId: string;
  onClose: () => void;
  preferImmediateReveal?: boolean;
  externalDocument?: BotFlowDocument | null;
  documentRevision?: number;
  isFlowGenerating?: boolean;
  committedDocument?: BotFlowDocument | null;
};

function CanvasLoadingPlaceholder() {
  return (
    <div className="relative h-full min-h-0 bg-background">
      <div className="absolute inset-0 [background-image:radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:24px_24px]" />
    </div>
  );
}

function SaveStatusPill({ status }: { status: FlowSaveStatus }) {
  const label =
    status === "saving" ? "Сохраняем…" : status === "saved" ? "Сохранено" : "Ошибка сохранения";

  return (
    <AnimatedStatusBadge show={status !== "idle"} badgeKey={`save-${status}`}>
      <Badge
        variant={status === "error" ? "destructive" : "secondary"}
        className="bg-card/95 shadow-sm backdrop-blur-sm"
      >
        {label}
      </Badge>
    </AnimatedStatusBadge>
  );
}

export function FlowCanvasPanelContent({
  projectId,
  onClose,
  preferImmediateReveal = false,
  externalDocument = null,
  documentRevision = 0,
  isFlowGenerating = false,
  committedDocument = null,
}: FlowCanvasPanelContentProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"bot" | "secrets">("bot");
  const relayoutRef = useRef<(() => void) | null>(null);
  const botRuntime = useBotRuntime(projectId);
  const { initialDocument, isLoading, error, saveStatus, queueSave, syncDocument } =
    useFlowPersistence(projectId);

  useEffect(() => {
    if (committedDocument) {
      syncDocument(committedDocument);
    }
  }, [committedDocument, syncDocument]);

  const handleDocumentChange = useCallback(
    (doc: BotFlowDocument) => {
      if (isFlowGenerating) {
        return;
      }

      queueSave(doc);
    },
    [isFlowGenerating, queueSave],
  );

  const persistedDocument = committedDocument ?? initialDocument;
  const hasStreamingDocument = Boolean(
    externalDocument &&
      !isStreamingSeedFlow(externalDocument) &&
      (externalDocument.nodes.length > 0 || (persistedDocument?.nodes.length ?? 0) === 0),
  );
  const editorDocument =
    isFlowGenerating && hasStreamingDocument ? externalDocument : persistedDocument;

  return (
    <div className="relative h-full min-h-0 bg-background">
      <div className="pointer-events-none absolute top-3 left-3 z-30 flex items-center gap-2">
        <BotRuntimeStatusBadge runtime={botRuntime} />
        <SaveStatusPill status={saveStatus} />
      </div>

      <div className="pointer-events-none absolute top-3 right-3 z-30 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => relayoutRef.current?.()}
          disabled={isFlowGenerating || !editorDocument || editorDocument.nodes.length === 0}
          className="pointer-events-auto bg-card/95 shadow-sm backdrop-blur-sm"
        >
          <LayoutGridIcon />
          Выровнять
        </Button>
        <BotRunActions
          runtime={botRuntime}
          onOpenSettings={(tab) => {
            setSettingsInitialTab(tab ?? "bot");
            setSettingsOpen(true);
          }}
        />
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки бота"
          className="pointer-events-auto bg-card/95 shadow-sm backdrop-blur-sm"
        >
          <SettingsIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onClose}
          aria-label="Закрыть холст"
          className="pointer-events-auto bg-card/95 shadow-sm backdrop-blur-sm"
        >
          <XIcon />
        </Button>
      </div>

      <BotSettingsSheet
        projectId={settingsOpen ? projectId : null}
        initialTab={settingsInitialTab}
        onClose={() => setSettingsOpen(false)}
      />

      {isLoading ? (
        <CanvasLoadingPlaceholder />
      ) : error ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        </div>
      ) : editorDocument ? (
        <FlowEditor
          key={projectId}
          projectId={projectId}
          flowDocument={editorDocument}
          revealDelayMs={preferImmediateReveal ? 0 : undefined}
          externalDocument={hasStreamingDocument ? externalDocument : null}
          documentRevision={documentRevision}
          isFlowGenerating={isFlowGenerating}
          onDocumentChange={handleDocumentChange}
          relayoutRef={relayoutRef}
        />
      ) : null}
    </div>
  );
}

export { CanvasLoadingPlaceholder };
export { FlowCanvasPanelContent as FlowCanvasPanel };
