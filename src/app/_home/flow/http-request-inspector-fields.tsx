"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { HttpRequestHeader, HttpRequestNodeData } from "@/lib/flow/flow-schema";
import { normalizeVariableKey } from "@/lib/flow/set-variable-node-utils";

type HttpRequestInspectorFieldsProps = {
  data: HttpRequestNodeData;
  onUpdate: (patch: Partial<HttpRequestNodeData>) => void;
};

const METHODS: HttpRequestNodeData["method"][] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function HttpRequestInspectorFields({ data, onUpdate }: HttpRequestInspectorFieldsProps) {
  const headers = data.headers ?? [];
  const showBody = data.method !== "GET" && data.method !== "DELETE";

  function updateHeader(index: number, patch: Partial<HttpRequestHeader>) {
    const next = headers.map((header, headerIndex) =>
      headerIndex === index ? { ...header, ...patch } : header,
    );
    onUpdate({ headers: next });
  }

  function addHeader() {
    onUpdate({ headers: [...headers, { key: "Authorization", value: "" }] });
  }

  function removeHeader(index: number) {
    onUpdate({ headers: headers.filter((_, headerIndex) => headerIndex !== index) });
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="http-method">Метод</FieldLabel>
        <Select
          value={data.method}
          onValueChange={(value: HttpRequestNodeData["method"]) => onUpdate({ method: value })}
        >
          <SelectTrigger id="http-method" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="http-url">URL</FieldLabel>
        <Input
          id="http-url"
          value={data.url}
          onChange={(event) => onUpdate({ url: event.target.value })}
          placeholder="https://api.example.com/items/{{var.id}}"
        />
      </Field>

      <Field>
        <div className="mb-2 flex items-center justify-between">
          <FieldLabel>Заголовки</FieldLabel>
          <Button type="button" variant="outline" size="sm" onClick={addHeader}>
            <PlusIcon className="size-3.5" />
            Добавить
          </Button>
        </div>
        {headers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Заголовки не заданы</p>
        ) : (
          <div className="space-y-2">
            {headers.map((header, index) => (
              <div key={`${header.key}-${index}`} className="flex items-start gap-2">
                <Input
                  value={header.key}
                  onChange={(event) => updateHeader(index, { key: event.target.value })}
                  placeholder="Header"
                  className="w-28 shrink-0"
                />
                <Input
                  value={header.value}
                  onChange={(event) => updateHeader(index, { value: event.target.value })}
                  placeholder="Bearer {{secret.API_KEY}}"
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeHeader(index)}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Field>

      {showBody ? (
        <Field>
          <FieldLabel htmlFor="http-body">Тело запроса</FieldLabel>
          <Textarea
            id="http-body"
            value={data.body ?? ""}
            onChange={(event) => onUpdate({ body: event.target.value })}
            className="min-h-24 resize-none font-mono text-xs"
            placeholder='{"user_id": "{{user_id}}"}'
          />
        </Field>
      ) : null}

      <Field>
        <FieldLabel htmlFor="http-response-var">Сохранить ответ в</FieldLabel>
        <Input
          id="http-response-var"
          value={data.responseVariable ?? ""}
          onChange={(event) =>
            onUpdate({
              responseVariable: normalizeVariableKey(event.target.value) || undefined,
            })
          }
          placeholder="response_body"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="http-status-var">Сохранить HTTP-код в</FieldLabel>
        <Input
          id="http-status-var"
          value={data.responseStatusVariable ?? ""}
          onChange={(event) =>
            onUpdate({
              responseStatusVariable: normalizeVariableKey(event.target.value) || undefined,
            })
          }
          placeholder="http_status"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="http-timeout">Таймаут (мс)</FieldLabel>
        <Input
          id="http-timeout"
          type="number"
          min={1000}
          max={30000}
          value={data.timeoutMs ?? 10000}
          onChange={(event) =>
            onUpdate({
              timeoutMs: Number.parseInt(event.target.value, 10) || 10000,
            })
          }
        />
      </Field>
    </FieldGroup>
  );
}
