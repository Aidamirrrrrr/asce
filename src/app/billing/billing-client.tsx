"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlanCard = {
  id: string;
  name: string;
  priceRub: number;
  features: string[];
};

type UsageInfo = {
  period: string;
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
};

function formatTokens(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function BillingClient({
  currentPlanId,
  usage,
  plans,
}: {
  currentPlanId: string;
  usage: UsageInfo;
  plans: PlanCard[];
}) {
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const usedPercent =
    usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  async function startCheckout(planId: string) {
    setPendingPlan(planId);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await response.json()) as { confirmationUrl?: string; error?: string };
      if (!(response.ok && data.confirmationUrl)) {
        toast.error(data.error ?? "Не удалось начать оплату");
        return;
      }
      window.location.href = data.confirmationUrl;
    } catch {
      toast.error("Ошибка сети при оплате");
    } finally {
      setPendingPlan(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">Тарифы и оплата</h1>
        <p className="text-muted-foreground text-sm">
          Лимит ИИ обновляется ежемесячно. Период: {usage.period}.
        </p>
      </header>

      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Расход ИИ за месяц</span>
          <span className={cn("tabular-nums", usage.exceeded && "text-destructive")}>
            {formatTokens(usage.used)} / {formatTokens(usage.limit)} токенов
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
          <div
            className={cn("h-full rounded-full bg-primary", usage.exceeded && "bg-destructive")}
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        {usage.exceeded ? (
          <p className="mt-2 text-destructive text-xs">
            Лимит исчерпан. Генерация ИИ недоступна до смены тарифа или нового периода.
          </p>
        ) : (
          <p className="mt-2 text-muted-foreground text-xs">
            Осталось {formatTokens(usage.remaining)} токенов.
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isFree = plan.priceRub === 0;
          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10",
                isCurrent && "ring-2 ring-primary",
              )}
            >
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-lg">{plan.name}</span>
                <span className="font-semibold text-2xl">
                  {isFree ? "Бесплатно" : `${plan.priceRub} ₽`}
                  {!isFree && <span className="text-muted-foreground text-sm"> / мес</span>}
                </span>
              </div>
              <ul className="flex flex-1 flex-col gap-1.5 text-muted-foreground text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>· {feature}</li>
                ))}
              </ul>
              {isCurrent ? (
                <Button variant="outline" disabled>
                  Текущий тариф
                </Button>
              ) : isFree ? (
                <Button variant="outline" disabled>
                  Базовый
                </Button>
              ) : (
                <Button onClick={() => startCheckout(plan.id)} disabled={pendingPlan !== null}>
                  {pendingPlan === plan.id ? "Открываем оплату…" : "Оформить"}
                </Button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
