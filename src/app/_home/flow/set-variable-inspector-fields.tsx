"use client";

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
import type { SetVariableNodeData } from "@/lib/flow/flow-schema";
import { isValidVariableKey, normalizeVariableKey } from "@/lib/flow/set-variable-node-utils";

type SetVariableInspectorFieldsProps = {
  data: SetVariableNodeData;
  onUpdate: (patch: Partial<SetVariableNodeData>) => void;
};

export function SetVariableInspectorFields({ data, onUpdate }: SetVariableInspectorFieldsProps) {
  const keyValid = isValidVariableKey(data.variableKey);

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="set-var-key">Ключ переменной</FieldLabel>
        <Input
          id="set-var-key"
          value={data.variableKey}
          onChange={(event) => onUpdate({ variableKey: normalizeVariableKey(event.target.value) })}
          placeholder="order_id"
        />
        {!keyValid ? (
          <p className="text-xs text-destructive">Формат: snake_case, латиница, с буквы</p>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">{`{{var.${data.variableKey}}}`}</p>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="set-var-source">Источник значения</FieldLabel>
        <Select
          value={data.valueSource}
          onValueChange={(value: SetVariableNodeData["valueSource"]) =>
            onUpdate({ valueSource: value })
          }
        >
          <SelectTrigger id="set-var-source" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="literal">Фиксированное значение</SelectItem>
            <SelectItem value="user_message">Текст сообщения пользователя</SelectItem>
            <SelectItem value="template">Шаблон</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {data.valueSource !== "user_message" ? (
        <Field>
          <FieldLabel htmlFor="set-var-value">
            {data.valueSource === "template" ? "Шаблон" : "Значение"}
          </FieldLabel>
          {data.valueSource === "template" ? (
            <Textarea
              id="set-var-value"
              value={data.value ?? ""}
              onChange={(event) => onUpdate({ value: event.target.value })}
              className="min-h-20 resize-none font-mono text-xs"
              placeholder="Заказ {{var.order_id}}"
            />
          ) : (
            <Input
              id="set-var-value"
              value={data.value ?? ""}
              onChange={(event) => onUpdate({ value: event.target.value })}
            />
          )}
        </Field>
      ) : null}
    </FieldGroup>
  );
}
