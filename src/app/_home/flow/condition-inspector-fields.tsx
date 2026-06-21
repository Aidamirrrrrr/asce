"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { createConditionRuleId } from "@/lib/flow/condition-node-utils";
import type { ConditionNodeData, ConditionRule } from "@/lib/flow/flow-schema";
import { cn } from "@/lib/utils";

type KnownChat = {
  id: string;
  chatId: string;
  title: string;
  username: string | null;
  chatType: string;
  botIsAdmin: boolean;
};

type ConditionInspectorFieldsProps = {
  projectId: string;
  data: ConditionNodeData;
  onUpdate: (data: Partial<ConditionNodeData>) => void;
};

export function ConditionInspectorFields({
  projectId,
  data,
  onUpdate,
}: ConditionInspectorFieldsProps) {
  const [knownChats, setKnownChats] = useState<KnownChat[]>([]);
  const [manualChatId, setManualChatId] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadChats() {
      setLoadingChats(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/known-chats`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { chats?: KnownChat[] };
        if (!cancelled) {
          setKnownChats(payload.chats ?? []);
        }
      } finally {
        if (!cancelled) {
          setLoadingChats(false);
        }
      }
    }

    void loadChats();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function updateRules(rules: ConditionRule[]) {
    onUpdate({ rules });
  }

  function addRule(type: ConditionRule["type"]) {
    const base = { id: createConditionRuleId() };

    switch (type) {
      case "chat_member":
        updateRules([
          ...data.rules,
          { ...base, type: "chat_member", chatIds: [], chatMatchMode: "all" },
        ]);
        break;
      case "is_premium":
        updateRules([...data.rules, { ...base, type: "is_premium", expected: true }]);
        break;
      case "has_username":
        updateRules([...data.rules, { ...base, type: "has_username", expected: true }]);
        break;
      case "start_param":
        updateRules([
          ...data.rules,
          { ...base, type: "start_param", operator: "equals", value: "" },
        ]);
        break;
    }
  }

  async function verifyManualChat() {
    const chatId = manualChatId.trim();
    if (!chatId) {
      return;
    }

    setVerifying(true);
    setManualError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/known-chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });

      const payload = (await response.json()) as { chat?: KnownChat; error?: string };
      if (!(response.ok && payload.chat)) {
        throw new Error(payload.error ?? "Не удалось проверить чат");
      }

      setKnownChats((current) => {
        const without = current.filter((item) => item.chatId !== payload.chat?.chatId);
        // biome-ignore lint/style/noNonNullAssertion: payload.chat presence checked by the guard above
        return [payload.chat!, ...without];
      });
      setManualChatId("");
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "Ошибка проверки чата");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel>Объединение правил</FieldLabel>
        <Select
          value={data.matchMode}
          onValueChange={(value: ConditionNodeData["matchMode"]) => onUpdate({ matchMode: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Все правила (И)</SelectItem>
            <SelectItem value="any">Любое правило (ИЛИ)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Separator />

      <div className="space-y-3">
        <FieldLabel>Правила</FieldLabel>

        {data.rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Добавьте хотя бы одно правило.</p>
        ) : null}

        {data.rules.map((rule, index) => (
          <div key={rule.id} className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Правило {index + 1}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => updateRules(data.rules.filter((item) => item.id !== rule.id))}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>

            {rule.type === "chat_member" ? (
              <ChatMemberRuleEditor
                rule={rule}
                knownChats={knownChats}
                loadingChats={loadingChats}
                onChange={(next) =>
                  updateRules(data.rules.map((item) => (item.id === rule.id ? next : item)))
                }
              />
            ) : null}

            {rule.type === "is_premium" ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={rule.expected}
                  onCheckedChange={(checked) =>
                    updateRules(
                      data.rules.map((item) =>
                        item.id === rule.id && item.type === "is_premium"
                          ? { ...item, expected: checked === true }
                          : item,
                      ),
                    )
                  }
                />
                Пользователь с Telegram Premium
              </label>
            ) : null}

            {rule.type === "has_username" ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={rule.expected}
                  onCheckedChange={(checked) =>
                    updateRules(
                      data.rules.map((item) =>
                        item.id === rule.id && item.type === "has_username"
                          ? { ...item, expected: checked === true }
                          : item,
                      ),
                    )
                  }
                />
                У пользователя есть @username
              </label>
            ) : null}

            {rule.type === "start_param" ? (
              <div className="space-y-2">
                <Select
                  value={rule.operator}
                  onValueChange={(value: "equals" | "contains") =>
                    updateRules(
                      data.rules.map((item) =>
                        item.id === rule.id && item.type === "start_param"
                          ? { ...item, operator: value }
                          : item,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="equals">Равно</SelectItem>
                    <SelectItem value="contains">Содержит</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={rule.value}
                  onChange={(event) =>
                    updateRules(
                      data.rules.map((item) =>
                        item.id === rule.id && item.type === "start_param"
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    )
                  }
                  placeholder="Значение start-параметра"
                />
              </div>
            ) : null}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => addRule("chat_member")}>
            <PlusIcon className="size-4" />
            Подписка
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addRule("is_premium")}>
            Premium
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addRule("has_username")}>
            Username
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addRule("start_param")}>
            Start param
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <FieldLabel>Добавить чат вручную</FieldLabel>
        <div className="flex gap-2">
          <Input
            value={manualChatId}
            onChange={(event) => setManualChatId(event.target.value)}
            placeholder="@channel или -100…"
          />
          <Button
            type="button"
            variant="outline"
            disabled={verifying}
            onClick={() => void verifyManualChat()}
          >
            {verifying ? "…" : "Проверить"}
          </Button>
        </div>
        {manualError ? <p className="text-xs text-destructive">{manualError}</p> : null}
        <FieldDescription>
          Бот должен быть админом канала/группы. Чаты из апдейтов появляются в списке подписки
          автоматически.
        </FieldDescription>
      </div>
    </div>
  );
}

function ChatMemberRuleEditor({
  rule,
  knownChats,
  loadingChats,
  onChange,
}: {
  rule: Extract<ConditionRule, { type: "chat_member" }>;
  knownChats: KnownChat[];
  loadingChats: boolean;
  onChange: (rule: Extract<ConditionRule, { type: "chat_member" }>) => void;
}) {
  function toggleChat(chatId: string) {
    const next = rule.chatIds.includes(chatId)
      ? rule.chatIds.filter((id) => id !== chatId)
      : [...rule.chatIds, chatId];
    onChange({ ...rule, chatIds: next });
  }

  return (
    <div className="space-y-3">
      <Select
        value={rule.chatMatchMode}
        onValueChange={(value: "all" | "any") => onChange({ ...rule, chatMatchMode: value })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="all">Подписан на все чаты</SelectItem>
          <SelectItem value="any">Подписан хотя бы на один</SelectItem>
        </SelectContent>
      </Select>

      {loadingChats ? (
        <p className="text-xs text-muted-foreground">Загрузка чатов…</p>
      ) : knownChats.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Пока нет известных чатов. Добавьте бота в канал/группу или укажите chat_id вручную.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {knownChats.map((chat) => {
            const selected = rule.chatIds.includes(chat.chatId);
            const label = chat.username ? `${chat.title} (@${chat.username})` : chat.title;

            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => toggleChat(chat.chatId)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-left text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40",
                )}
              >
                {label}
                {!chat.botIsAdmin ? " · бот не админ" : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
