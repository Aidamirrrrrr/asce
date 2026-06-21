"use client";

import { CheckCircle2Icon, CircleDashedIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProjectSecretSummary } from "@/lib/bot/project-secrets";
import { cn } from "@/lib/utils";

type SecretsLaunchChecklistProps = {
  secrets: ProjectSecretSummary[];
  className?: string;
  onOpenSecrets?: () => void;
};

export function SecretsLaunchChecklist({
  secrets,
  className,
  onOpenSecrets,
}: SecretsLaunchChecklistProps) {
  if (secrets.length === 0) {
    return null;
  }

  const missingCount = secrets.filter((secret) => !secret.hasValue).length;
  const ready = missingCount === 0;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/35 bg-amber-500/8",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {ready ? "Секреты готовы к запуску" : "Перед запуском заполните секреты"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ready
              ? `Все ${secrets.length} ключ(ей) заполнены`
              : `Заполнено ${secrets.length - missingCount} из ${secrets.length}`}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {secrets.map((secret) => (
          <li key={secret.key} className="flex items-start gap-2 text-sm">
            {secret.hasValue ? (
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div className="min-w-0">
              <p className="leading-snug">{secret.label ?? secret.key}</p>
              {!secret.hasValue && secret.description ? (
                <p className="text-xs text-muted-foreground">{secret.description}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {!ready && onOpenSecrets ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={onOpenSecrets}
        >
          Заполнить секреты
        </Button>
      ) : null}
    </div>
  );
}
