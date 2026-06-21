"use client";

import {
  BotIcon,
  CheckIcon,
  CopyIcon,
  HistoryIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  UserIcon,
} from "lucide-react";
import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatActionCardPanel } from "@/app/_home/chat-action-card";
import { ChatMarkdown } from "@/app/_home/chat-markdown";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildStepLimitNotice } from "@/lib/ai/flow-agent-continue";
import { canRollbackToMessage } from "@/lib/chat/chat-rollback";
import type { ChatBuildPlanState } from "@/lib/chat/build-plan-message";
import { duration, gentleEase } from "@/lib/motion";
import type { ProjectChatMessage, ProjectSummary } from "@/lib/projects";
import { cn } from "@/lib/utils";

function ThinkingDots({ label }: { label: string }) {
  return (
    <output className="inline-flex items-center gap-0.5" aria-label={label || "Ассистент думает"}>
      {label ? <span>{label}</span> : null}
      {[0, 1, 2].map((index) => (
        <m.span
          key={index}
          className="inline-block"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: index * 0.18 }}
        >
          .
        </m.span>
      ))}
    </output>
  );
}

function BuildPlanChecklist({ plan }: { plan: ChatBuildPlanState }) {
  const done = new Set(plan.done);
  const currentIndex = plan.items.findIndex((_, index) => !done.has(index));
  const isActive = plan.status === "active";

  if (plan.items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        <ThinkingDots label={plan.statusLabel || "Думаю"} />
        {plan.nodeCount > 0 ? (
          <span className="ml-2 text-xs text-muted-foreground/70">· узлов: {plan.nodeCount}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {isActive ? <Loader2Icon className="size-3.5 animate-spin text-primary" /> : null}
        <span>{isActive ? "Собираю сценарий" : "План сборки"}</span>
        <span className="text-muted-foreground/60">
          · {done.size}/{plan.items.length}
          {plan.nodeCount > 0 ? ` · ${plan.nodeCount} узл.` : ""}
        </span>
      </div>
      <ul className="space-y-1.5">
        {plan.items.map((item, index) => {
          const isDone = done.has(index);
          const isCurrent = isActive && index === currentIndex;
          return (
            <li
              key={`${index}-${item}`}
              className={cn(
                "flex items-start gap-2 text-sm leading-snug transition-colors",
                isDone
                  ? "text-muted-foreground line-through decoration-muted-foreground/40"
                  : isCurrent
                    ? "text-foreground"
                    : "text-muted-foreground/70",
              )}
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {isDone ? (
                  <CheckIcon className="size-3.5 text-primary" />
                ) : isCurrent ? (
                  <Loader2Icon className="size-3.5 animate-spin text-primary" />
                ) : (
                  <span className="size-2.5 rounded-full border border-muted-foreground/40" />
                )}
              </span>
              <span className="min-w-0">{item}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type ProjectChatPanelProps = {
  project: ProjectSummary;
  messages: ProjectChatMessage[];
  className?: string;
  onContinueAgent?: () => void;
  isContinueDisabled?: boolean;
  onActionCard?: (messageId: string, actionId: string) => void;
  onRollback?: (messageId: string) => Promise<void>;
  isRollbackDisabled?: boolean;
};

function StepLimitBanner({
  onContinue,
  disabled,
}: {
  onContinue?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground">
      <p className="leading-relaxed text-amber-950 dark:text-amber-50">{buildStepLimitNotice()}</p>
      <Button type="button" size="sm" className="mt-2" disabled={disabled} onClick={onContinue}>
        Продолжить
      </Button>
    </div>
  );
}

function isActiveStepLimitMessage(
  messages: ProjectChatMessage[],
  message: ProjectChatMessage,
): boolean {
  if (!message.meta?.stepLimitReached) {
    return false;
  }

  const lastAssistant = [...messages]
    .reverse()
    .find((item) => item.role === "assistant" && !item.meta?.buildPlan && !item.meta?.streaming);
  return lastAssistant?.id === message.id;
}

function ChatMessageActions({
  message,
  messages,
  isUser,
  onRollback,
  isRollbackDisabled,
}: {
  message: ProjectChatMessage;
  messages: ProjectChatMessage[];
  isUser: boolean;
  onRollback?: (messageId: string) => Promise<void>;
  isRollbackDisabled?: boolean;
}) {
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const canCopy = message.content.trim().length > 0;
  const canRollback = Boolean(onRollback) && canRollbackToMessage(messages, message.id);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Сообщение скопировано");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  async function handleRollback() {
    if (!onRollback) {
      return;
    }

    setIsRollingBack(true);
    try {
      await onRollback(message.id);
      setRollbackOpen(false);
      toast.success("Чат и сценарий откачены");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось откатить");
    } finally {
      setIsRollingBack(false);
    }
  }

  if (!canCopy && !canRollback) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          "absolute top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100",
          isUser ? "-left-1 -translate-x-full" : "-right-1 translate-x-full",
        )}
      >
        <TooltipProvider delayDuration={300}>
          {canCopy ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 bg-background/90 shadow-sm"
                  onClick={() => void handleCopy()}
                >
                  <CopyIcon className="size-3.5" />
                  <span className="sr-only">Копировать</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Копировать</TooltipContent>
            </Tooltip>
          ) : null}
          {canRollback ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 bg-background/90 shadow-sm"
                  disabled={isRollbackDisabled || isRollingBack}
                  onClick={() => setRollbackOpen(true)}
                >
                  <HistoryIcon className="size-3.5" />
                  <span className="sr-only">Откатить к сообщению</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Откатить чат и сценарий</TooltipContent>
            </Tooltip>
          ) : null}
        </TooltipProvider>
      </div>

      <AlertDialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Откатить к этому сообщению?</AlertDialogTitle>
            <AlertDialogDescription>
              Все сообщения после этого будут удалены, а сценарий на холсте вернётся к состоянию на
              этот момент. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRollingBack}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={isRollingBack} onClick={() => void handleRollback()}>
              {isRollingBack ? "Откатываем…" : "Откатить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChatMessageRow({
  message,
  messages,
  onContinueAgent,
  isContinueDisabled,
  onActionCard,
  onRollback,
  isRollbackDisabled,
}: {
  message: ProjectChatMessage;
  messages: ProjectChatMessage[];
  onContinueAgent?: () => void;
  isContinueDisabled?: boolean;
  onActionCard?: (messageId: string, actionId: string) => void;
  onRollback?: (messageId: string) => Promise<void>;
  isRollbackDisabled?: boolean;
}) {
  const isUser = message.role === "user";
  const showStepLimit = isActiveStepLimitMessage(messages, message);
  const actionCard = message.meta?.actionCard;
  const buildPlan = message.meta?.buildPlan;
  const isStreaming = message.meta?.streaming === true;
  const showActions = !buildPlan && !isStreaming;

  return (
    <m.div
      layout={false}
      initial={{ opacity: 0, y: isUser ? 10 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: gentleEase }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      <Avatar
        size="sm"
        className={cn(
          "mt-0.5 shrink-0",
          isUser ? "bg-primary text-primary-foreground" : "border border-border/60 bg-card",
        )}
      >
        <AvatarFallback
          className={cn(
            isUser ? "bg-primary text-primary-foreground" : "bg-transparent text-primary",
          )}
        >
          {isUser ? <UserIcon className="size-3.5" /> : <BotIcon className="size-3.5" />}
        </AvatarFallback>
      </Avatar>
      <div className="group/message relative min-w-0 max-w-[85%] space-y-2">
        <div
          className={cn(
            "relative px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
              : "rounded-2xl rounded-bl-md border border-border/60 bg-muted/60 text-foreground",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : buildPlan ? (
            <BuildPlanChecklist plan={buildPlan} />
          ) : isStreaming && !message.content.trim() ? (
            <ThinkingDots label="Думаю" />
          ) : (
            <>
              <ChatMarkdown content={message.content} />
              {isStreaming ? (
                <span
                  className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary/70 align-middle"
                  aria-hidden
                />
              ) : null}
            </>
          )}
        </div>
        {showActions ? (
          <ChatMessageActions
            message={message}
            messages={messages}
            isUser={isUser}
            onRollback={onRollback}
            isRollbackDisabled={isRollbackDisabled}
          />
        ) : null}
        {showStepLimit ? (
          <StepLimitBanner onContinue={onContinueAgent} disabled={isContinueDisabled} />
        ) : null}
        {actionCard ? (
          <ChatActionCardPanel
            card={actionCard}
            onAction={(actionId) => onActionCard?.(message.id, actionId)}
          />
        ) : null}
      </div>
    </m.div>
  );
}

function ChatEmptyState() {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: gentleEase }}
      className="flex flex-col items-center gap-3 px-4 py-10 text-center"
    >
      <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <MessageSquarePlusIcon className="size-5" />
      </div>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Меняйте сценарий на холсте через чат или спрашивайте о пользователях, активности и заявках —
        ассистент ответит по данным бота.
      </p>
    </m.div>
  );
}

export function ProjectChatPanel({
  project,
  messages,
  className,
  onContinueAgent,
  isContinueDisabled = false,
  onActionCard,
  onRollback,
  isRollbackDisabled = false,
}: ProjectChatPanelProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when chat messages change
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null;
    const content = messagesRef.current;

    if (!(viewport && content)) {
      return;
    }

    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="mx-auto flex w-full max-w-3xl shrink-0 px-1 pr-4 pb-3">
        <h2 className="min-w-0 truncate font-heading text-lg font-medium">{project.name}</h2>
      </div>
      <div ref={scrollAreaRef} className="h-0 min-h-0 flex-1">
        <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport][data-orientation=vertical]]:w-1.5 [&_[data-slot=scroll-area-viewport][data-orientation=vertical]]:p-0">
          <div
            ref={messagesRef}
            className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-1 pr-4 pb-4"
          >
            {messages.length === 0 ? (
              <ChatEmptyState />
            ) : (
              messages.map((message) => (
                <ChatMessageRow
                  key={message.id}
                  message={message}
                  messages={messages}
                  onContinueAgent={onContinueAgent}
                  isContinueDisabled={isContinueDisabled}
                  onActionCard={onActionCard}
                  onRollback={onRollback}
                  isRollbackDisabled={isRollbackDisabled}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
