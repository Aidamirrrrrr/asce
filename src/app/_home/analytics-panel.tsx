"use client";

import { SendIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ChatMarkdown } from "@/app/_home/chat-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type AnalyticsOverview = {
  users: { total: number; blocked: number };
  activeUsers: { day: number; week: number };
  newUsersLast7Days: number;
  messagesLast7Days: number;
  eventsByType: { type: string; count: number }[];
  topCommands: { command: string; count: number }[];
  errorsLast7Days: number;
  recentErrors: { message: string; createdAt: string }[];
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  message_in: "Входящие сообщения",
  message_out: "Исходящие сообщения",
  command: "Команды",
  callback: "Нажатия кнопок",
  node_executed: "Исполнения нод",
  error: "Ошибки",
};

const SUGGESTED_QUESTIONS = [
  "Сколько всего пользователей?",
  "Сколько активных за неделю?",
  "Какие команды самые популярные?",
  "Были ли ошибки за последние 7 дней?",
];

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="gap-1 p-4">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </Card>
  );
}

export function AnalyticsPanel({ projectId }: { projectId: string }) {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingOverview(true);
    setOverviewError(null);

    async function load() {
      try {
        const response = await fetch(`/api/projects/${projectId}/analytics`);
        const data = (await response.json()) as AnalyticsOverview & { error?: string };
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setOverviewError(data.error ?? "Не удалось загрузить аналитику");
          return;
        }
        setOverview(data);
      } catch {
        if (!cancelled) {
          setOverviewError("Не удалось загрузить аналитику");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingOverview(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isAsking) {
        return;
      }

      setIsAsking(true);
      setAnswer(null);
      setAnswerError(null);

      try {
        const response = await fetch(`/api/projects/${projectId}/analytics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const data = (await response.json()) as { answer?: string; error?: string };
        if (!response.ok) {
          setAnswerError(data.error ?? "Не удалось получить ответ");
          return;
        }
        setAnswer(data.answer ?? "");
      } catch {
        setAnswerError("Не удалось получить ответ");
      } finally {
        setIsAsking(false);
      }
    },
    [projectId, isAsking],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-1">
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Обзор за 7 дней</h3>
        {isLoadingOverview ? (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : overviewError ? (
          <p className="text-sm text-destructive">{overviewError}</p>
        ) : overview ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Всего пользователей" value={overview.users.total} />
              <MetricCard label="Активны за неделю" value={overview.activeUsers.week} />
              <MetricCard label="Новые за неделю" value={overview.newUsersLast7Days} />
              <MetricCard label="Сообщения за неделю" value={overview.messagesLast7Days} />
            </div>

            {overview.topCommands.length > 0 ? (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-muted-foreground">Топ команд</h4>
                <div className="space-y-1">
                  {overview.topCommands.map((item) => (
                    <div
                      key={item.command}
                      className="flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-sm"
                    >
                      <span className="font-mono text-xs">{item.command}</span>
                      <span className="tabular-nums text-muted-foreground">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {overview.eventsByType.length > 0 ? (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-muted-foreground">События</h4>
                <div className="space-y-1">
                  {overview.eventsByType.map((item) => (
                    <div
                      key={item.type}
                      className="flex items-center justify-between rounded-md px-2.5 py-1 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {EVENT_TYPE_LABELS[item.type] ?? item.type}
                      </span>
                      <span className="tabular-nums">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {overview.users.blocked > 0 || overview.errorsLast7Days > 0 ? (
              <p className="text-xs text-muted-foreground">
                Заблокировали бота: {overview.users.blocked} · Ошибок за неделю:{" "}
                {overview.errorsLast7Days}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium text-muted-foreground">Спросить об аналитике</h3>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUESTIONS.map((item) => (
            <Button
              key={item}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto py-1 text-xs"
              disabled={isAsking}
              onClick={() => {
                setQuestion(item);
                void ask(item);
              }}
            >
              {item}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void ask(question);
              }
            }}
            placeholder="Например: сколько пользователей пришло за месяц?"
            className="min-h-[60px] resize-none"
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0 self-end"
            disabled={isAsking || !question.trim()}
            onClick={() => void ask(question)}
          >
            <SendIcon className="size-4" />
          </Button>
        </div>

        {isAsking ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : answerError ? (
          <p className="text-sm text-destructive">{answerError}</p>
        ) : answer ? (
          <Card className="p-3 text-sm">
            <ChatMarkdown content={answer} />
          </Card>
        ) : null}
      </section>
    </div>
  );
}
