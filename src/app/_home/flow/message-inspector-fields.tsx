"use client";

import { PlusIcon } from "lucide-react";
import { useRef } from "react";
import { MessageAttachmentsEditor } from "@/app/_home/flow/message-attachments-editor";
import { MessagePreviewPanel } from "@/app/_home/flow/message-preview-panel";
import {
  TelegramFormatTextarea,
  type TelegramFormatTextareaHandle,
} from "@/app/_home/flow/telegram-format-textarea";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  InlineButton,
  MessageAttachmentsMode,
  MessageKeyboard,
  MessageNodeData,
  ReplyKeyboardButton,
} from "@/lib/flow/flow-schema";
import { createMessageButtonId } from "@/lib/flow/message-node-utils";
import {
  clampButtonText,
  getButtonTextLength,
  TELEGRAM_MAX_BUTTON_TEXT_LENGTH,
} from "@/lib/flow/telegram-button-limits";
import {
  countTelegramPlainText,
  getMessageTextLimit,
  messageTextUsesMediaCaption,
  truncateTelegramPlainText,
} from "@/lib/flow/telegram-limits";
import { TEMPLATE_VAR_DEFINITIONS, textContainsSecretReference } from "@/lib/flow/template-vars";
import { cn } from "@/lib/utils";

type MessageInspectorFieldsProps = {
  projectId: string;
  nodeId: string;
  data: MessageNodeData;
  flowVariableKeys?: string[];
  onUpdate: (data: Partial<MessageNodeData>) => void;
};

export function MessageInspectorFields({
  projectId,
  nodeId,
  data,
  flowVariableKeys = [],
  onUpdate,
}: MessageInspectorFieldsProps) {
  const textEditorRef = useRef<TelegramFormatTextareaHandle>(null);
  const attachmentsMode: MessageAttachmentsMode = data.attachmentsMode ?? "album";

  function setKeyboard(keyboard: MessageKeyboard | undefined) {
    onUpdate({ keyboard });
  }

  const textLimit = getMessageTextLimit(data.attachments);
  const usesMediaCaption = messageTextUsesMediaCaption(data.attachments);
  const plainTextLength = countTelegramPlainText(data.text ?? "");

  function handleTextChange(text: string) {
    onUpdate({
      text: truncateTelegramPlainText(text, textLimit),
      parseMode: "HTML",
    });
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${nodeId}-message-text`}>
          {usesMediaCaption ? "Текст / подпись" : "Текст сообщения"}
        </FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VAR_DEFINITIONS.map((item) => (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 font-mono text-xs"
              onClick={() => textEditorRef.current?.insertText(item.template)}
            >
              {item.template}
            </Button>
          ))}
          {flowVariableKeys.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 font-mono text-xs"
              onClick={() => textEditorRef.current?.insertText(`{{var.${key}}}`)}
            >
              {`{{var.${key}}}`}
            </Button>
          ))}
        </div>
        <FieldDescription>
          Переменные подставляются при отправке: Telegram-поля и пользовательские var.* из сценария.
        </FieldDescription>
        {textContainsSecretReference(data.text ?? "") ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            В тексте есть ссылка на секрет — убедитесь, что ключ не попадёт пользователю.
          </p>
        ) : null}
        <TelegramFormatTextarea
          key={nodeId}
          ref={textEditorRef}
          id={`${nodeId}-message-text`}
          value={data.text ?? ""}
          placeholder={usesMediaCaption ? "Подпись к вложению" : "Текст сообщения"}
          maxPlainTextLength={textLimit}
          onChange={handleTextChange}
        />
        <FieldDescription>
          {usesMediaCaption
            ? `Подпись к вложению, до ${textLimit} символов (лимит Telegram).`
            : `До ${textLimit} символов.`}{" "}
          {plainTextLength} / {textLimit}
        </FieldDescription>
      </Field>

      <MessagePreviewPanel projectId={projectId} data={data} flowVariableKeys={flowVariableKeys} />

      <Field orientation="horizontal">
        <Switch
          id={`${nodeId}-link-preview`}
          checked={data.linkPreview !== false}
          onCheckedChange={(checked) => onUpdate({ linkPreview: checked })}
        />
        <FieldLabel htmlFor={`${nodeId}-link-preview`}>Превью ссылок</FieldLabel>
      </Field>

      <Separator />

      <div className="space-y-3">
        <FieldLabel>Отправка</FieldLabel>
        <Field orientation="horizontal">
          <Switch
            id={`${nodeId}-silent`}
            checked={data.silent === true}
            onCheckedChange={(checked) => onUpdate({ silent: checked })}
          />
          <FieldLabel htmlFor={`${nodeId}-silent`}>Без звука</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch
            id={`${nodeId}-protect-content`}
            checked={data.protectContent === true}
            onCheckedChange={(checked) => onUpdate({ protectContent: checked })}
          />
          <FieldLabel htmlFor={`${nodeId}-protect-content`}>Защита контента</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch
            id={`${nodeId}-reply-to-user`}
            checked={data.replyToUser === true}
            onCheckedChange={(checked) => onUpdate({ replyToUser: checked })}
          />
          <FieldLabel htmlFor={`${nodeId}-reply-to-user`}>
            Ответ на сообщение пользователя
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch
            id={`${nodeId}-show-typing`}
            checked={data.showTyping === true}
            onCheckedChange={(checked) => onUpdate({ showTyping: checked })}
          />
          <FieldLabel htmlFor={`${nodeId}-show-typing`}>Показать «печатает…»</FieldLabel>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${nodeId}-delay-seconds`}>Задержка, сек</FieldLabel>
          <Input
            id={`${nodeId}-delay-seconds`}
            type="number"
            min={0}
            max={604800}
            step={1}
            value={data.delaySeconds ?? ""}
            placeholder="0 — сразу"
            onChange={(event) => {
              const raw = event.target.value.trim();
              if (!raw) {
                onUpdate({ delaySeconds: undefined });
                return;
              }

              const parsed = Number.parseInt(raw, 10);
              if (!Number.isFinite(parsed) || parsed <= 0) {
                onUpdate({ delaySeconds: undefined });
                return;
              }

              onUpdate({ delaySeconds: Math.min(604800, parsed) });
            }}
          />
          <FieldDescription>
            Отложенная отправка сохраняется в базе. Бот должен быть запущен в момент срабатывания
            задержки.
          </FieldDescription>
        </Field>
      </div>

      <Separator />

      <MessageAttachmentsEditor
        projectId={projectId}
        mode={attachmentsMode}
        attachments={data.attachments ?? []}
        messageText={data.text ?? ""}
        onUpdate={onUpdate}
      />

      <Separator />

      <div className="space-y-3">
        <FieldLabel>Клавиатура</FieldLabel>
        <Tabs
          value={data.keyboard?.type ?? "none"}
          onValueChange={(value) => {
            if (value === "none") {
              setKeyboard(undefined);
              return;
            }

            if (value === "remove") {
              setKeyboard({ type: "remove" });
              return;
            }

            if (value === "inline") {
              setKeyboard({
                type: "inline",
                rows: data.keyboard?.type === "inline" ? data.keyboard.rows : [[]],
              });
              return;
            }

            setKeyboard({
              type: "reply",
              rows: data.keyboard?.type === "reply" ? data.keyboard.rows : [[]],
              resize: data.keyboard?.type === "reply" ? data.keyboard.resize : true,
            });
          }}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="none">Нет</TabsTrigger>
            <TabsTrigger value="inline">Inline</TabsTrigger>
            <TabsTrigger value="reply">Reply</TabsTrigger>
            <TabsTrigger value="remove">Убрать</TabsTrigger>
          </TabsList>

          <TabsContent value="inline" className="space-y-3">
            <InlineKeyboardEditor
              rows={data.keyboard?.type === "inline" ? data.keyboard.rows : [[]]}
              onChange={(rows) => setKeyboard({ type: "inline", rows })}
            />
          </TabsContent>

          <TabsContent value="reply" className="space-y-3">
            <ReplyKeyboardEditor
              keyboard={
                data.keyboard?.type === "reply"
                  ? data.keyboard
                  : { type: "reply", rows: [[]], resize: true }
              }
              onChange={setKeyboard}
            />
          </TabsContent>

          <TabsContent value="remove">
            <FieldDescription>
              Бот отправит сообщение с флагом удаления reply-клавиатуры у пользователя.
            </FieldDescription>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function InlineKeyboardEditor({
  rows,
  onChange,
}: {
  rows: InlineButton[][];
  onChange: (rows: InlineButton[][]) => void;
}) {
  function updateRows(nextRows: InlineButton[][]) {
    onChange(nextRows.filter((row) => row.length > 0));
  }

  return (
    <div className="space-y-3">
      {rows.map((row, rowIndex) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: keyboard rows are identified by position and have no stable id
          key={`inline-row-${rowIndex}`}
          className="space-y-2 rounded-lg border border-border p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Строка {rowIndex + 1}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => updateRows(rows.filter((_, index) => index !== rowIndex))}
            >
              Удалить строку
            </Button>
          </div>

          {row.map((button, buttonIndex) => (
            <div key={button.id} className="grid gap-2">
              <ButtonTextField
                value={button.text}
                onChange={(text) => {
                  const nextRows = rows.map((currentRow, currentRowIndex) =>
                    currentRowIndex === rowIndex
                      ? currentRow.map((currentButton, currentButtonIndex) =>
                          currentButtonIndex === buttonIndex
                            ? patchInlineButtonText(currentButton, text)
                            : currentButton,
                        )
                      : currentRow,
                  );
                  onChange(nextRows);
                }}
              />
              <Select
                value={button.kind}
                onValueChange={(value) => {
                  const nextRows = rows.map((currentRow, currentRowIndex) =>
                    currentRowIndex === rowIndex
                      ? currentRow.map((currentButton, currentButtonIndex) =>
                          currentButtonIndex === buttonIndex
                            ? patchInlineButtonKind(currentButton, value as InlineButton["kind"])
                            : currentButton,
                        )
                      : currentRow,
                  );
                  onChange(nextRows);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="callback">Ветка сценария</SelectItem>
                  <SelectItem value="url">Ссылка</SelectItem>
                  <SelectItem value="web_app">Web App</SelectItem>
                  <SelectItem value="copy_text">Копировать текст</SelectItem>
                  <SelectItem value="switch_inline">Switch inline</SelectItem>
                </SelectContent>
              </Select>
              {button.kind === "url" ? (
                <Input
                  value={button.url}
                  onChange={(event) => {
                    const nextRows = rows.map((currentRow, currentRowIndex) =>
                      currentRowIndex === rowIndex
                        ? currentRow.map((currentButton, currentButtonIndex) =>
                            currentButtonIndex === buttonIndex && currentButton.kind === "url"
                              ? { ...currentButton, url: event.target.value }
                              : currentButton,
                          )
                        : currentRow,
                    );
                    onChange(nextRows);
                  }}
                  placeholder="https://"
                />
              ) : null}
              {button.kind === "web_app" ? (
                <Input
                  value={button.webAppUrl}
                  onChange={(event) => {
                    const nextRows = rows.map((currentRow, currentRowIndex) =>
                      currentRowIndex === rowIndex
                        ? currentRow.map((currentButton, currentButtonIndex) =>
                            currentButtonIndex === buttonIndex && currentButton.kind === "web_app"
                              ? { ...currentButton, webAppUrl: event.target.value }
                              : currentButton,
                          )
                        : currentRow,
                    );
                    onChange(nextRows);
                  }}
                  placeholder="https://app.example.com"
                />
              ) : null}
              {button.kind === "copy_text" ? (
                <Input
                  value={button.copyText}
                  onChange={(event) => {
                    const nextRows = rows.map((currentRow, currentRowIndex) =>
                      currentRowIndex === rowIndex
                        ? currentRow.map((currentButton, currentButtonIndex) =>
                            currentButtonIndex === buttonIndex && currentButton.kind === "copy_text"
                              ? { ...currentButton, copyText: event.target.value }
                              : currentButton,
                          )
                        : currentRow,
                    );
                    onChange(nextRows);
                  }}
                  placeholder="Текст для буфера обмена"
                />
              ) : null}
              {button.kind === "switch_inline" ? (
                <Input
                  value={button.switchInlineQuery}
                  onChange={(event) => {
                    const nextRows = rows.map((currentRow, currentRowIndex) =>
                      currentRowIndex === rowIndex
                        ? currentRow.map((currentButton, currentButtonIndex) =>
                            currentButtonIndex === buttonIndex &&
                            currentButton.kind === "switch_inline"
                              ? { ...currentButton, switchInlineQuery: event.target.value }
                              : currentButton,
                          )
                        : currentRow,
                    );
                    onChange(nextRows);
                  }}
                  placeholder="Запрос для inline-режима"
                />
              ) : null}
              {button.kind === "callback" ? (
                <FieldDescription>Проведите стрелку с handle кнопки на холсте.</FieldDescription>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const nextRows = rows.map((currentRow, currentRowIndex) =>
                    currentRowIndex === rowIndex
                      ? currentRow.filter(
                          (_, currentButtonIndex) => currentButtonIndex !== buttonIndex,
                        )
                      : currentRow,
                  );
                  updateRows(nextRows);
                }}
              >
                Удалить кнопку
              </Button>
            </div>
          ))}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const nextRows = rows.map((currentRow, currentRowIndex) =>
                currentRowIndex === rowIndex
                  ? [...currentRow, createDefaultInlineButton("callback")]
                  : currentRow,
              );
              onChange(nextRows);
            }}
          >
            <PlusIcon className="size-4" />
            Кнопка
          </Button>
        </div>
      ))}

      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, []])}>
        <PlusIcon className="size-4" />
        Строка
      </Button>
    </div>
  );
}

function ReplyKeyboardEditor({
  keyboard,
  onChange,
}: {
  keyboard: Extract<MessageKeyboard, { type: "reply" }>;
  onChange: (keyboard: MessageKeyboard) => void;
}) {
  const rows = keyboard.rows;

  function updateRows(nextRows: ReplyKeyboardButton[][]) {
    onChange({
      ...keyboard,
      rows: nextRows.filter((row) => row.length > 0),
    });
  }

  return (
    <div className="space-y-3">
      <Field orientation="horizontal">
        <Checkbox
          id="reply-resize"
          checked={keyboard.resize !== false}
          onCheckedChange={(checked) => onChange({ ...keyboard, resize: checked === true })}
        />
        <FieldLabel htmlFor="reply-resize">Уменьшать клавиатуру</FieldLabel>
      </Field>

      <Field orientation="horizontal">
        <Checkbox
          id="reply-one-time"
          checked={keyboard.oneTime === true}
          onCheckedChange={(checked) => onChange({ ...keyboard, oneTime: checked === true })}
        />
        <FieldLabel htmlFor="reply-one-time">Скрыть после нажатия</FieldLabel>
      </Field>

      {rows.map((row, rowIndex) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: keyboard rows are identified by position and have no stable id
          key={`reply-row-${rowIndex}`}
          className="space-y-2 rounded-lg border border-border p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Строка {rowIndex + 1}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => updateRows(rows.filter((_, index) => index !== rowIndex))}
            >
              Удалить строку
            </Button>
          </div>

          {row.map((button, buttonIndex) => (
            <div key={button.id} className="grid gap-2">
              <ButtonTextField
                value={button.text}
                onChange={(text) => {
                  const nextRows = rows.map((currentRow, currentRowIndex) =>
                    currentRowIndex === rowIndex
                      ? currentRow.map((currentButton, currentButtonIndex) =>
                          currentButtonIndex === buttonIndex
                            ? patchReplyButtonText(currentButton, text)
                            : currentButton,
                        )
                      : currentRow,
                  );
                  onChange({ ...keyboard, rows: nextRows });
                }}
              />
              <Select
                value={button.kind}
                onValueChange={(value) => {
                  const nextRows = rows.map((currentRow, currentRowIndex) =>
                    currentRowIndex === rowIndex
                      ? currentRow.map((currentButton, currentButtonIndex) =>
                          currentButtonIndex === buttonIndex
                            ? patchReplyButtonKind(
                                currentButton,
                                value as ReplyKeyboardButton["kind"],
                              )
                            : currentButton,
                        )
                      : currentRow,
                  );
                  onChange({ ...keyboard, rows: nextRows });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="text">Текст / ветка</SelectItem>
                  <SelectItem value="request_contact">Запросить контакт</SelectItem>
                  <SelectItem value="request_location">Запросить геолокацию</SelectItem>
                </SelectContent>
              </Select>
              {button.kind === "text" ? (
                <FieldDescription>Проведите стрелку с handle кнопки на холсте.</FieldDescription>
              ) : (
                <FieldDescription>
                  После нажатия сценарий продолжится по стрелке «Далее» с этой ноды.
                </FieldDescription>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start px-0"
                onClick={() => {
                  const nextRows = rows.map((currentRow, currentRowIndex) =>
                    currentRowIndex === rowIndex
                      ? currentRow.filter(
                          (_, currentButtonIndex) => currentButtonIndex !== buttonIndex,
                        )
                      : currentRow,
                  );
                  updateRows(nextRows);
                }}
              >
                Удалить кнопку
              </Button>
            </div>
          ))}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const nextRows = rows.map((currentRow, currentRowIndex) =>
                currentRowIndex === rowIndex
                  ? [...currentRow, createDefaultReplyButton("text")]
                  : currentRow,
              );
              onChange({ ...keyboard, rows: nextRows });
            }}
          >
            <PlusIcon className="size-4" />
            Кнопка
          </Button>
        </div>
      ))}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange({ ...keyboard, rows: [...rows, []] })}
      >
        <PlusIcon className="size-4" />
        Строка
      </Button>
    </div>
  );
}

function ButtonTextField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const length = getButtonTextLength(value);
  const overLimit = length > TELEGRAM_MAX_BUTTON_TEXT_LENGTH;

  return (
    <div className="space-y-1">
      <Input
        value={value}
        onChange={(event) => onChange(clampButtonText(event.target.value))}
        placeholder="Текст кнопки"
        className={cn(overLimit && "border-destructive")}
        aria-invalid={overLimit}
      />
      <p className={cn("text-xs", overLimit ? "text-destructive" : "text-muted-foreground")}>
        {length} / {TELEGRAM_MAX_BUTTON_TEXT_LENGTH}
      </p>
    </div>
  );
}

function createDefaultInlineButton(kind: InlineButton["kind"]): InlineButton {
  const base = { id: createMessageButtonId(), text: "Кнопка" };

  switch (kind) {
    case "url":
      return { ...base, kind, url: "https://" };
    case "web_app":
      return { ...base, kind, webAppUrl: "https://" };
    case "copy_text":
      return { ...base, kind, copyText: "" };
    case "switch_inline":
      return { ...base, kind, switchInlineQuery: "" };
    default:
      return { ...base, kind: "callback" };
  }
}

function patchInlineButtonText(button: InlineButton, text: string): InlineButton {
  return { ...button, text: clampButtonText(text) } as InlineButton;
}

function patchInlineButtonKind(button: InlineButton, kind: InlineButton["kind"]): InlineButton {
  const next = createDefaultInlineButton(kind);
  return { ...next, id: button.id, text: button.text };
}

function createDefaultReplyButton(kind: ReplyKeyboardButton["kind"]): ReplyKeyboardButton {
  const base = { id: createMessageButtonId(), text: "Кнопка" };

  if (kind === "request_contact") {
    return { ...base, kind: "request_contact" };
  }

  if (kind === "request_location") {
    return { ...base, kind: "request_location" };
  }

  return { ...base, kind: "text" };
}

function patchReplyButtonText(button: ReplyKeyboardButton, text: string): ReplyKeyboardButton {
  return { ...button, text: clampButtonText(text) };
}

function patchReplyButtonKind(
  button: ReplyKeyboardButton,
  kind: ReplyKeyboardButton["kind"],
): ReplyKeyboardButton {
  const next = createDefaultReplyButton(kind);
  return { ...next, id: button.id, text: button.text };
}
