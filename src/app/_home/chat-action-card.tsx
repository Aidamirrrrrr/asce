"use client";

import { ChatMarkdown } from "@/app/_home/chat-markdown";
import { Button } from "@/components/ui/button";
import type { ChatActionCard } from "@/lib/projects";
import { cn } from "@/lib/utils";

type ChatActionCardPanelProps = {
  card: ChatActionCard;
  disabled?: boolean;
  onAction?: (actionId: string) => void;
};

export function ChatActionCardPanel({ card, disabled, onAction }: ChatActionCardPanelProps) {
  const isResolved = card.status === "resolved";

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm shadow-sm">
      {card.title ? <p className="font-medium text-foreground">{card.title}</p> : null}
      {card.description ? <p className="mt-1 text-muted-foreground">{card.description}</p> : null}
      {card.body ? (
        <div className="mt-2 text-foreground">
          <ChatMarkdown content={card.body} />
        </div>
      ) : null}
      {card.actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.actions.map((action) => {
            const isChosen = isResolved && card.resolvedActionId === action.id;

            return (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant={action.variant ?? "default"}
                disabled={disabled || isResolved}
                className={cn(isChosen && "ring-2 ring-primary ring-offset-2")}
                onClick={() => onAction?.(action.id)}
              >
                {action.label}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
