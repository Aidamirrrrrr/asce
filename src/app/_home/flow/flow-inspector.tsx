"use client";

import {
  BellRingIcon,
  BracesIcon,
  ClipboardListIcon,
  CornerRightDownIcon,
  DatabaseIcon,
  GitBranchIcon,
  GlobeIcon,
  ListChecksIcon,
  MessageSquareIcon,
  SparklesIcon,
  TextCursorInputIcon,
  VariableIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConditionInspectorFields } from "@/app/_home/flow/condition-inspector-fields";
import { HttpRequestInspectorFields } from "@/app/_home/flow/http-request-inspector-fields";
import { MessageInspectorFields } from "@/app/_home/flow/message-inspector-fields";
import { SaveRecordInspectorFields } from "@/app/_home/flow/save-record-inspector-fields";
import { SetVariableInspectorFields } from "@/app/_home/flow/set-variable-inspector-fields";
import { WaitInputInspectorFields } from "@/app/_home/flow/wait-input-inspector-fields";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type {
  AdminNotifyNodeData,
  AiReplyNodeData,
  ConditionNodeData,
  FlowNode,
  FlowNodeType,
  HttpRequestNodeData,
  JsonExtractNodeData,
  MessageNodeData,
  SaveRecordNodeData,
  SetVariableNodeData,
  TriggerNodeData,
  WaitInputNodeData,
} from "@/lib/flow/flow-schema";

const CLOSE_ANIMATION_MS = 220;

type FlowInspectorProps = {
  projectId: string;
  node: FlowNode | null;
  flowVariableKeys?: string[];
  onUpdate: (nodeId: string, data: Partial<FlowNode["data"]>) => void;
  onClose: () => void;
};

const nodeTypeMeta: Record<
  FlowNodeType,
  { label: string; description: string; icon: typeof ZapIcon }
> = {
  trigger: {
    label: "Триггер",
    description: "Точка входа в сценарий",
    icon: ZapIcon,
  },
  message: {
    label: "Сообщение",
    description: "Текст, медиа и клавиатуры",
    icon: MessageSquareIcon,
  },
  condition: {
    label: "Условие",
    description: "Ветвление по правилам Telegram",
    icon: GitBranchIcon,
  },
  set_variable: {
    label: "Переменная",
    description: "Запись пользовательской переменной",
    icon: VariableIcon,
  },
  wait_input: {
    label: "Ожидание ввода",
    description: "Пауза до следующего сообщения пользователя",
    icon: TextCursorInputIcon,
  },
  http_request: {
    label: "HTTP-запрос",
    description: "Интеграция с внешним API",
    icon: GlobeIcon,
  },
  ai_reply: {
    label: "AI-ответ",
    description: "Генерация ответа через LLM",
    icon: SparklesIcon,
  },
  admin_notify: {
    label: "Уведомление админу",
    description: "Отправка сообщения в заданный чат",
    icon: BellRingIcon,
  },
  json_extract: {
    label: "Извлечь из JSON",
    description: "Значение по пути из переменной в переменную",
    icon: BracesIcon,
  },
  save_record: {
    label: "Запись",
    description: "Сохранение данных во встроенное хранилище проекта",
    icon: DatabaseIcon,
  },
  choice: {
    label: "Выбор",
    description: "Inline-кнопки с сохранением выбора в переменную",
    icon: ListChecksIcon,
  },
  jump: {
    label: "Переход",
    description: "Переход к другой ноде по ID",
    icon: CornerRightDownIcon,
  },
  form: {
    label: "Форма",
    description: "Последовательный сбор нескольких полей",
    icon: ClipboardListIcon,
  },
};

export function FlowInspector({
  projectId,
  node,
  flowVariableKeys = [],
  onUpdate,
  onClose,
}: FlowInspectorProps) {
  const [displayNode, setDisplayNode] = useState<FlowNode | null>(null);
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (node) {
      clearTimeout(closeTimerRef.current);
      setDisplayNode(node);
      setOpen(true);
      return;
    }

    setOpen(false);
  }, [node]);

  useEffect(() => {
    if (open || !displayNode) {
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      setDisplayNode(null);
    }, CLOSE_ANIMATION_MS);

    return () => {
      clearTimeout(closeTimerRef.current);
    };
  }, [open, displayNode]);

  useEffect(() => {
    return () => {
      clearTimeout(closeTimerRef.current);
    };
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      onClose();
    }
  }

  if (!displayNode) {
    return null;
  }

  const data = displayNode.data;
  const meta = nodeTypeMeta[displayNode.type];
  const TypeIcon = meta.icon;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-80 flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2 pr-8">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <TypeIcon className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle>Свойства узла</SheetTitle>
              <SheetDescription>{meta.description}</SheetDescription>
            </div>
          </div>
          <Badge variant="secondary">{meta.label}</Badge>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="node-label">Название</FieldLabel>
                <Input
                  id="node-label"
                  value={data.label}
                  onChange={(event) => onUpdate(displayNode.id, { label: event.target.value })}
                />
              </Field>

              {displayNode.type === "trigger" ? (
                <>
                  <Separator />
                  <Field>
                    <FieldLabel htmlFor="trigger-type">Тип триггера</FieldLabel>
                    <Select
                      value={(data as TriggerNodeData).triggerType}
                      onValueChange={(value: TriggerNodeData["triggerType"]) =>
                        onUpdate(displayNode.id, { triggerType: value })
                      }
                    >
                      <SelectTrigger id="trigger-type" className="w-full">
                        <SelectValue placeholder="Выберите тип" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="command">Команда</SelectItem>
                        <SelectItem value="any_message">Любое сообщение</SelectItem>
                        <SelectItem value="inactivity">Бездействие</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {(data as TriggerNodeData).triggerType === "command" ? (
                    <Field>
                      <FieldLabel htmlFor="trigger-command">Команда</FieldLabel>
                      <Input
                        id="trigger-command"
                        value={(data as TriggerNodeData).command}
                        onChange={(event) =>
                          onUpdate(displayNode.id, { command: event.target.value })
                        }
                        placeholder="/start"
                      />
                    </Field>
                  ) : null}
                  {(data as TriggerNodeData).triggerType === "inactivity" ? (
                    <Field>
                      <FieldLabel htmlFor="trigger-inactivity-hours">
                        Часов без активности
                      </FieldLabel>
                      <Input
                        id="trigger-inactivity-hours"
                        type="number"
                        min={1}
                        max={168}
                        value={(data as TriggerNodeData).inactivityHours ?? 24}
                        onChange={(event) =>
                          onUpdate(displayNode.id, {
                            inactivityHours: Number(event.target.value),
                          })
                        }
                      />
                      <FieldDescription>
                        Сценарий запустится, если пользователь не писал боту указанное время (1–168
                        ч).
                      </FieldDescription>
                    </Field>
                  ) : null}
                </>
              ) : null}

              {displayNode.type === "message" ? (
                <>
                  <Separator />
                  <MessageInspectorFields
                    projectId={projectId}
                    nodeId={displayNode.id}
                    data={data as MessageNodeData}
                    flowVariableKeys={flowVariableKeys}
                    onUpdate={(patch) => onUpdate(displayNode.id, patch)}
                  />
                </>
              ) : null}

              {displayNode.type === "condition" ? (
                <>
                  <Separator />
                  <ConditionInspectorFields
                    projectId={projectId}
                    data={data as ConditionNodeData}
                    onUpdate={(patch) => onUpdate(displayNode.id, patch)}
                  />
                </>
              ) : null}

              {displayNode.type === "set_variable" ? (
                <>
                  <Separator />
                  <SetVariableInspectorFields
                    data={data as SetVariableNodeData}
                    onUpdate={(patch) => onUpdate(displayNode.id, patch)}
                  />
                </>
              ) : null}

              {displayNode.type === "wait_input" ? (
                <>
                  <Separator />
                  <WaitInputInspectorFields
                    data={data as WaitInputNodeData}
                    onUpdate={(patch) => onUpdate(displayNode.id, patch)}
                  />
                </>
              ) : null}

              {displayNode.type === "http_request" ? (
                <>
                  <Separator />
                  <HttpRequestInspectorFields
                    data={data as HttpRequestNodeData}
                    onUpdate={(patch) => onUpdate(displayNode.id, patch)}
                  />
                </>
              ) : null}

              {displayNode.type === "ai_reply" ? (
                <>
                  <Separator />
                  <Field>
                    <FieldLabel htmlFor="ai-prompt">System prompt</FieldLabel>
                    <Textarea
                      id="ai-prompt"
                      value={(data as AiReplyNodeData).systemPrompt}
                      onChange={(event) =>
                        onUpdate(displayNode.id, { systemPrompt: event.target.value })
                      }
                      className="min-h-32 resize-none"
                    />
                  </Field>
                </>
              ) : null}

              {displayNode.type === "admin_notify" ? (
                <>
                  <Separator />
                  <Field>
                    <FieldLabel htmlFor="admin-chat-id">Чат для уведомления</FieldLabel>
                    <Input
                      id="admin-chat-id"
                      value={(data as AdminNotifyNodeData).chatId}
                      onChange={(event) => onUpdate(displayNode.id, { chatId: event.target.value })}
                      placeholder="{{secret.ADMIN_CHAT_ID}}"
                    />
                    <FieldDescription>
                      ID чата/канала или шаблон, напр. {"{{secret.ADMIN_CHAT_ID}}"}.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="admin-text">Текст уведомления</FieldLabel>
                    <Textarea
                      id="admin-text"
                      value={(data as AdminNotifyNodeData).text}
                      onChange={(event) => onUpdate(displayNode.id, { text: event.target.value })}
                      className="min-h-24 resize-none"
                      placeholder="Новая запись от {{var.first_name}}"
                    />
                    <FieldDescription>
                      Поддерживает {"{{var.*}}"} и {"{{secret.*}}"}.
                    </FieldDescription>
                  </Field>
                </>
              ) : null}

              {displayNode.type === "json_extract" ? (
                <>
                  <Separator />
                  <Field>
                    <FieldLabel htmlFor="json-source">Переменная-источник</FieldLabel>
                    <Input
                      id="json-source"
                      value={(data as JsonExtractNodeData).sourceVariable}
                      onChange={(event) =>
                        onUpdate(displayNode.id, { sourceVariable: event.target.value })
                      }
                      placeholder="response"
                    />
                    <FieldDescription>
                      Переменная с JSON-строкой (напр. ответ HTTP-запроса).
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="json-path">Путь</FieldLabel>
                    <Input
                      id="json-path"
                      value={(data as JsonExtractNodeData).path}
                      onChange={(event) => onUpdate(displayNode.id, { path: event.target.value })}
                      placeholder="data.items[0].name"
                    />
                    <FieldDescription>Пусто — записать весь объект как строку.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="json-target">Переменная-результат</FieldLabel>
                    <Input
                      id="json-target"
                      value={(data as JsonExtractNodeData).targetVariable}
                      onChange={(event) =>
                        onUpdate(displayNode.id, { targetVariable: event.target.value })
                      }
                      placeholder="extracted"
                    />
                  </Field>
                </>
              ) : null}

              {displayNode.type === "save_record" ? (
                <>
                  <Separator />
                  <SaveRecordInspectorFields
                    data={data as SaveRecordNodeData}
                    onUpdate={(patch) => onUpdate(displayNode.id, patch)}
                  />
                </>
              ) : null}
            </FieldGroup>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
