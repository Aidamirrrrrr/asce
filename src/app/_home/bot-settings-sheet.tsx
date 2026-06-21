"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SecretsLaunchChecklist } from "@/app/_home/secrets-launch-checklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectSecretSummary } from "@/lib/bot/project-secrets";
import type { DeliveryMode, ProjectDetail, ProjectSummary } from "@/lib/projects";

const CLOSE_ANIMATION_MS = 220;
const isDev = process.env.NODE_ENV === "development";
const defaultDeliveryMode: DeliveryMode = isDev ? "polling" : "webhook";

type BotSettingsSheetProps = {
  projectId: string | null;
  onClose: () => void;
  onSaved?: (project: ProjectSummary) => void;
  initialTab?: "bot" | "secrets";
};

type SecretDraft = ProjectSecretSummary & {
  draftValue: string;
  suggestedValue?: string;
};

export function BotSettingsSheet({
  projectId,
  onClose,
  onSaved,
  initialTab = "bot",
}: BotSettingsSheetProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"bot" | "secrets">("bot");
  const [botToken, setBotToken] = useState("");
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [hasBotToken, setHasBotToken] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(defaultDeliveryMode);
  const [webhookConfigError, setWebhookConfigError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<SecretDraft[]>([]);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!projectId) {
      setOpen(false);
      return;
    }

    clearTimeout(closeTimerRef.current);
    setOpen(true);
    setActiveTab(initialTab);

    async function load() {
      setIsLoading(true);
      try {
        const [projectResponse, secretsResponse] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/secrets`),
        ]);

        const projectData = (await projectResponse.json()) as {
          project?: ProjectDetail;
          error?: string;
        };
        const secretsData = (await secretsResponse.json()) as {
          secrets?: ProjectSecretSummary[];
          suggestedValues?: Record<string, string>;
          publicUrls?: { yookassaWebhookUrl?: string };
          error?: string;
        };

        if (!(projectResponse.ok && projectData.project)) {
          throw new Error(projectData.error ?? "Не удалось загрузить настройки");
        }

        if (!(secretsResponse.ok && secretsData.secrets)) {
          throw new Error(secretsData.error ?? "Не удалось загрузить секреты");
        }

        setBotToken("");
        setTokenMasked(projectData.project.botTokenMasked);
        setHasBotToken(projectData.project.hasBotToken);
        setDeliveryMode(projectData.project.deliveryMode === "polling" ? "polling" : "webhook");
        setWebhookConfigError(projectData.project.webhookConfigError);
        const suggestedValues = secretsData.suggestedValues ?? {};
        setSecrets(
          secretsData.secrets.map((secret) => ({
            ...secret,
            draftValue: "",
            suggestedValue: suggestedValues[secret.key],
          })),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось загрузить настройки");
        setOpen(false);
        onClose();
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [projectId, onClose, initialTab]);

  useEffect(() => {
    if (open || projectId) {
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      setBotToken("");
      setTokenMasked(null);
      setWebhookConfigError(null);
      setSecrets([]);
    }, CLOSE_ANIMATION_MS);

    return () => {
      clearTimeout(closeTimerRef.current);
    };
  }, [open, projectId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      onClose();
    }
  }

  async function handleSave() {
    if (!projectId || isSaving) {
      return;
    }

    const trimmedToken = botToken.trim();
    if (activeTab === "bot" && !(hasBotToken || trimmedToken)) {
      toast.error("Укажите токен бота");
      return;
    }

    setIsSaving(true);

    try {
      if (activeTab === "bot") {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(trimmedToken ? { botToken: trimmedToken } : {}),
            ...(isDev ? { deliveryMode } : { deliveryMode: "webhook" }),
          }),
        });

        const data = (await response.json()) as {
          project?: ProjectSummary;
          error?: string;
        };

        if (!(response.ok && data.project)) {
          throw new Error(data.error ?? "Не удалось сохранить настройки");
        }

        onSaved?.(data.project);
        toast.success("Настройки бота сохранены");
        handleOpenChange(false);
        return;
      }

      const payload = secrets
        .filter((secret) => secret.draftValue.trim())
        .map((secret) => ({
          key: secret.key,
          value: secret.draftValue.trim(),
        }));

      const response = await fetch(`/api/projects/${projectId}/secrets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secrets: payload }),
      });

      const data = (await response.json()) as {
        secrets?: ProjectSecretSummary[];
        error?: string;
      };

      if (!(response.ok && data.secrets)) {
        throw new Error(data.error ?? "Не удалось сохранить секреты");
      }

      setSecrets(
        data.secrets.map((secret) => ({
          ...secret,
          draftValue: "",
          suggestedValue: secrets.find((item) => item.key === secret.key)?.suggestedValue,
        })),
      );
      toast.success("Секреты сохранены");
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-80 flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="gap-1 border-b border-border p-4">
          <SheetTitle>Настройки проекта</SheetTitle>
          <SheetDescription>Токен бота, режим доставки и секреты для интеграций.</SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "bot" | "secrets")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-border px-4 pb-3 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="bot" className="flex-1">
                Бот
              </TabsTrigger>
              <TabsTrigger value="secrets" className="flex-1">
                Секреты
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  Загрузка…
                </div>
              ) : (
                <>
                  <TabsContent value="bot" className="mt-0">
                    {secrets.length > 0 ? (
                      <SecretsLaunchChecklist
                        secrets={secrets}
                        className="mb-4"
                        onOpenSecrets={() => setActiveTab("secrets")}
                      />
                    ) : null}
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="bot-token">Токен бота</FieldLabel>
                        <Input
                          id="bot-token"
                          type="password"
                          value={botToken}
                          onChange={(event) => setBotToken(event.target.value)}
                          placeholder={hasBotToken ? `Сохранён: ${tokenMasked}` : "123456:ABC..."}
                          disabled={isSaving}
                          autoComplete="off"
                        />
                      </Field>

                      {isDev ? (
                        <Field>
                          <FieldLabel>Режим доставки</FieldLabel>
                          <RadioGroup
                            value={deliveryMode}
                            onValueChange={(value) => setDeliveryMode(value as DeliveryMode)}
                            className="gap-3"
                            disabled={isSaving}
                          >
                            <Field orientation="horizontal">
                              <RadioGroupItem value="webhook" id="delivery-webhook" />
                              <FieldLabel htmlFor="delivery-webhook" className="font-normal">
                                Webhook
                              </FieldLabel>
                            </Field>
                            <Field orientation="horizontal">
                              <RadioGroupItem value="polling" id="delivery-polling" />
                              <FieldLabel htmlFor="delivery-polling" className="font-normal">
                                Long polling
                              </FieldLabel>
                            </Field>
                          </RadioGroup>
                          {deliveryMode === "webhook" && webhookConfigError ? (
                            <p className="text-xs text-destructive">{webhookConfigError}</p>
                          ) : null}
                        </Field>
                      ) : null}
                    </FieldGroup>
                  </TabsContent>

                  <TabsContent value="secrets" className="mt-0">
                    {secrets.length > 0 ? (
                      <SecretsLaunchChecklist secrets={secrets} className="mb-4" />
                    ) : null}
                    {secrets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Секреты появятся здесь, когда сценарий или AI укажут ключи для интеграций.
                      </p>
                    ) : (
                      <FieldGroup>
                        {secrets.map((secret, index) => (
                          <Field key={secret.key}>
                            <div className="mb-1 flex items-center gap-2">
                              <FieldLabel htmlFor={`secret-${secret.key}`}>
                                {secret.label ?? secret.key}
                              </FieldLabel>
                              {!secret.hasValue ? (
                                <Badge variant="outline" className="text-[10px]">
                                  не заполнен
                                </Badge>
                              ) : null}
                            </div>
                            {secret.description ? (
                              <p className="mb-2 text-xs text-muted-foreground">
                                {secret.description}
                              </p>
                            ) : null}
                            <Input
                              id={`secret-${secret.key}`}
                              type="password"
                              value={secret.draftValue}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setSecrets((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, draftValue: nextValue } : item,
                                  ),
                                );
                              }}
                              placeholder={
                                secret.hasValue
                                  ? `Сохранён: ${secret.masked ?? "••••••••"}`
                                  : secret.suggestedValue
                                    ? `Например: ${secret.suggestedValue}`
                                    : "Введите значение"
                              }
                              disabled={isSaving}
                              autoComplete="off"
                            />
                            {secret.suggestedValue && !secret.hasValue ? (
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                Рекомендуем: {secret.suggestedValue}
                              </p>
                            ) : null}
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                              {`{{secret.${secret.key}}}`}
                            </p>
                          </Field>
                        ))}
                      </FieldGroup>
                    )}
                  </TabsContent>
                </>
              )}
            </div>
          </ScrollArea>
        </Tabs>

        <SheetFooter className="border-t border-border p-4">
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving || isLoading}>
            {isSaving ? (
              <>
                <Loader2Icon className="animate-spin" />
                Сохраняем...
              </>
            ) : (
              "Сохранить"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
