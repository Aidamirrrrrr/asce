"use client";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { WaitInputNodeData } from "@/lib/flow/flow-schema";
import { isValidVariableKey, normalizeVariableKey } from "@/lib/flow/variable-key-utils";

type WaitInputInspectorFieldsProps = {
  data: WaitInputNodeData;
  onUpdate: (patch: Partial<WaitInputNodeData>) => void;
};

export function WaitInputInspectorFields({ data, onUpdate }: WaitInputInspectorFieldsProps) {
  const keyValid = isValidVariableKey(data.variableKey);

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="wait-input-key">Ключ переменной</FieldLabel>
        <Input
          id="wait-input-key"
          value={data.variableKey}
          onChange={(event) => onUpdate({ variableKey: normalizeVariableKey(event.target.value) })}
          placeholder="buyer_name"
        />
        {!keyValid ? (
          <p className="text-xs text-destructive">Формат: snake_case, латиница, с буквы</p>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">{`{{var.${data.variableKey}}}`}</p>
        )}
      </Field>
      <p className="text-xs text-muted-foreground">
        Бот остановится на этом узле и сохранит следующее текстовое сообщение пользователя в
        переменную.
      </p>
    </FieldGroup>
  );
}
