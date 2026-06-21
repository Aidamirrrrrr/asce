"use client";

import { BotIcon, SparklesIcon, XIcon } from "lucide-react";
import { domAnimation, LazyMotion, m } from "motion/react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";

import { BetaBadge } from "@/components/ui/beta-badge";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useModKeyLabel } from "@/hooks/use-mod-key-label";
import { consumeFlowGenerationStream } from "@/lib/ai/flow-generation-stream";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { duration, gentleEase } from "@/lib/motion";
import type { ProjectChatMessage, ProjectSummary } from "@/lib/projects";
import { cn } from "@/lib/utils";

type PromptComposerProps = {
  onCreated: (result: {
    project: ProjectSummary;
    messages?: ProjectChatMessage[];
    flow?: BotFlowDocument;
    flowUpdated?: boolean;
  }) => void;
  variant?: "launcher" | "chat";
  projectId?: string | null;
  onRefined?: (result: {
    project: ProjectSummary;
    assistantMessage: string;
    messages: ProjectChatMessage[];
    flow?: BotFlowDocument;
    flowUpdated?: boolean;
  }) => void;
  onGenerationStart?: (
    userMessage: string,
    options?: { silent?: boolean; forceFlow?: boolean; preserveFlow?: boolean },
  ) => void;
  onGenerationEnd?: () => void;
  onGenerationCancel?: () => void;
  onStreamStarted?: (project: ProjectSummary) => void;
  onStreamFlow?: (flow: BotFlowDocument) => void;
  onStreamIntent?: (intent: "flow" | "data" | "chat") => void;
  onStreamPlan?: (items: string[]) => void;
  onStreamPlanProgress?: (done: number[]) => void;
  onStreamProgress?: (nodeCount: number) => void;
  onStreamStatus?: (message: string) => void;
};

export type PromptComposerHandle = {
  continueAgent: () => Promise<void>;
  cancelGeneration: (options?: { silent?: boolean }) => void;
};

const heroVariants = {
  visible: {
    opacity: 1,
    height: "auto",
    marginBottom: 16,
    transition: { duration: duration.slow, ease: gentleEase },
  },
  hidden: {
    opacity: 0,
    height: 0,
    marginBottom: 0,
    transition: { duration: duration.slow, ease: gentleEase },
  },
};

export const PromptComposer = forwardRef<PromptComposerHandle, PromptComposerProps>(
  function PromptComposer(
    {
      onCreated,
      variant = "launcher",
      projectId = null,
      onRefined,
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
    },
    ref,
  ) {
    const [prompt, setPrompt] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const silentAbortRef = useRef(false);
    const modKeyLabel = useModKeyLabel();
    const isChat = variant === "chat";
    const isRefineMode = isChat && Boolean(projectId);

    function handleCancelRequest(options?: { silent?: boolean }) {
      silentAbortRef.current = options?.silent ?? false;
      abortControllerRef.current?.abort();
    }

    async function runRefineStream(
      body: { instruction?: string; continueAgent?: boolean },
      options: { silent?: boolean; successMessage?: string },
    ) {
      if (!projectId) {
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setIsSubmitting(true);
      onGenerationStart?.(body.instruction ?? "", {
        silent: options.silent,
        forceFlow: body.continueAgent === true,
        preserveFlow: true,
      });

      try {
        const response = await fetch(`/api/projects/${projectId}/refine-stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abortController.signal,
        });

        let completedIntent: "flow" | "data" | "chat" | null = null;

        await consumeFlowGenerationStream(
          response,
          {
            onStatus: (message) => onStreamStatus?.(message),
            onQueue: (message) => {
              onStreamStatus?.(message);
              toast.message(message);
            },
            onIntent: (intent) => {
              completedIntent = intent;
              onStreamIntent?.(intent);
            },
            onFlow: (flow, nodeCount) => {
              onStreamFlow?.(flow);
              onStreamProgress?.(nodeCount);
            },
            onPlan: (items) => onStreamPlan?.(items),
            onPlanProgress: (done) => onStreamPlanProgress?.(done),
            onComplete: (event) => {
              setPrompt("");
              onRefined?.({
                project: event.project,
                assistantMessage: event.assistantMessage,
                messages: event.messages ?? [],
                flow: event.flow,
                flowUpdated: event.flowUpdated ?? Boolean(event.flow),
              });
              const successMessage =
                options.successMessage ??
                (completedIntent === "data" || completedIntent === "chat"
                  ? "Ответ готов"
                  : "Сценарий обновлён");
              toast.success(successMessage);
            },
            onError: (message) => {
              throw new Error(message);
            },
          },
          { signal: abortController.signal },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          onGenerationCancel?.();
          if (!silentAbortRef.current) {
            toast.message("Запрос отменён");
          }
          silentAbortRef.current = false;
          return;
        }

        toast.error(error instanceof Error ? error.message : "Не удалось выполнить запрос");
      } finally {
        abortControllerRef.current = null;
        setIsSubmitting(false);
        onGenerationEnd?.();
      }
    }

    async function runCreateStream(value: string) {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setIsSubmitting(true);
      onGenerationStart?.(value);

      try {
        const response = await fetch("/api/projects/generate-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: value }),
          signal: abortController.signal,
        });

        await consumeFlowGenerationStream(
          response,
          {
            onStatus: (message) => onStreamStatus?.(message),
            onQueue: (message) => {
              onStreamStatus?.(message);
              toast.message(message);
            },
            onStarted: (project) => {
              onStreamStarted?.(project);
            },
            onFlow: (flow, nodeCount) => {
              onStreamFlow?.(flow);
              onStreamProgress?.(nodeCount);
            },
            onPlan: (items) => onStreamPlan?.(items),
            onPlanProgress: (done) => onStreamPlanProgress?.(done),
            onComplete: (event) => {
              setPrompt("");
              onCreated({
                project: event.project,
                messages: event.messages,
                flow: event.flow,
                flowUpdated: event.flowUpdated ?? Boolean(event.flow),
              });
              toast.success("Бот создан");
            },
            onError: (message) => {
              throw new Error(message);
            },
          },
          { signal: abortController.signal },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          onGenerationCancel?.();
          if (!silentAbortRef.current) {
            toast.message("Запрос отменён");
          }
          silentAbortRef.current = false;
          return;
        }

        toast.error(error instanceof Error ? error.message : "Не удалось выполнить запрос");
      } finally {
        abortControllerRef.current = null;
        setIsSubmitting(false);
        onGenerationEnd?.();
      }
    }

    useImperativeHandle(ref, () => ({
      continueAgent: async () => {
        if (isSubmitting || !isRefineMode) {
          return;
        }

        await runRefineStream(
          { continueAgent: true },
          { silent: true, successMessage: "Сборка продолжена" },
        );
      },
      cancelGeneration: (options) => {
        handleCancelRequest(options);
      },
    }));

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();

      const value = prompt.trim();
      if (!value || isSubmitting) {
        return;
      }

      if (isRefineMode) {
        await runRefineStream(
          { instruction: value },
          { silent: false, successMessage: "Сценарий обновлён" },
        );
        return;
      }

      await runCreateStream(value);
    }

    const submitLabel = isRefineMode ? "Отправить" : "Создать бота";

    return (
      <LazyMotion features={domAnimation}>
        <m.section
          className={cn(
            "relative mx-auto w-full max-w-3xl",
            isChat ? "bg-background/95 backdrop-blur-sm" : "text-center",
          )}
          initial={false}
          animate={{
            paddingTop: isChat ? 16 : 0,
            paddingBottom: isChat ? 16 : 0,
          }}
          transition={{ duration: duration.slow, ease: gentleEase }}
        >
          <m.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px origin-center bg-border"
            initial={false}
            animate={{
              opacity: isChat ? 1 : 0,
              scaleX: isChat ? 1 : 0.85,
            }}
            transition={{ duration: duration.slow, ease: gentleEase }}
          />
          <form
            onSubmit={handleSubmit}
            className={cn("mx-auto w-full max-w-3xl space-y-3", !isChat && "text-left")}
          >
            <m.div
              key="prompt-hero"
              className="space-y-2 overflow-hidden text-center"
              variants={heroVariants}
              initial={false}
              animate={isChat ? "hidden" : "visible"}
            >
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <SparklesIcon className="size-5" />
              </div>
              <h1 className="font-heading text-2xl font-medium tracking-tight @md/launcher:text-3xl @xl/launcher:text-4xl">
                Создайте Telegram-бота с <GradientText>AI</GradientText>
              </h1>
              <div className="flex justify-center">
                <BetaBadge>Открытая бета · бесплатно</BetaBadge>
              </div>
              <p className="text-sm text-muted-foreground @md/launcher:text-base">
                Опишите, что должен делать бот — справа откроется холст со сценарием. Сервис
                работает в режиме беты: запросы к ИИ могут вставать в очередь.
              </p>
            </m.div>

            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                isChat
                  ? "Измените сценарий или спросите о пользователях и заявках..."
                  : "Например: бот поддержки, который отвечает на вопросы о доставке и возвратах на русском..."
              }
              className={cn(
                "resize-none overflow-y-auto bg-card text-base",
                isChat ? "min-h-14 max-h-28" : "min-h-16 max-h-32",
              )}
              disabled={isSubmitting}
            />
            <div className="flex flex-col-reverse gap-3 @sm/launcher:flex-row @sm/launcher:items-center @sm/launcher:justify-between">
              {modKeyLabel ? (
                <p className="text-xs text-muted-foreground">
                  {`Быстрая отправка: ${modKeyLabel} + Enter`}
                </p>
              ) : (
                <Skeleton className="h-4 w-44" aria-hidden />
              )}
              <div className="flex items-center gap-2 self-end @sm/launcher:self-auto">
                <Button
                  type={isSubmitting ? "button" : "submit"}
                  variant={isSubmitting ? "outline" : "default"}
                  disabled={isSubmitting ? false : !prompt.trim()}
                  onClick={isSubmitting ? () => handleCancelRequest() : undefined}
                >
                  {isSubmitting ? (
                    <>
                      <XIcon />
                      Отменить
                    </>
                  ) : (
                    <>
                      <BotIcon />
                      {submitLabel}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </m.section>
      </LazyMotion>
    );
  },
);
