"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { SaveRecordField, SaveRecordNodeData } from "@/lib/flow/flow-schema";
import { normalizeCollectionName } from "@/lib/flow/save-record-node-utils";

type SaveRecordInspectorFieldsProps = {
  data: SaveRecordNodeData;
  onUpdate: (patch: Partial<SaveRecordNodeData>) => void;
};

export function SaveRecordInspectorFields({ data, onUpdate }: SaveRecordInspectorFieldsProps) {
  const fields = data.fields ?? [];

  const updateField = (index: number, patch: Partial<SaveRecordField>) => {
    const next = fields.map((field, i) => (i === index ? { ...field, ...patch } : field));
    onUpdate({ fields: next });
  };

  const addField = () => {
    onUpdate({ fields: [...fields, { key: "", value: "" }] });
  };

  const removeField = (index: number) => {
    onUpdate({ fields: fields.filter((_, i) => i !== index) });
  };

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="save-record-collection">Коллекция</FieldLabel>
        <Input
          id="save-record-collection"
          value={data.collection}
          onChange={(event) => onUpdate({ collection: event.target.value })}
          onBlur={(event) => onUpdate({ collection: normalizeCollectionName(event.target.value) })}
          placeholder="leads"
        />
        <FieldDescription>
          Имя коллекции (латиница, напр. appointments, leads). Записи можно смотреть в чате проекта.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Поля записи</FieldLabel>
        <FieldDescription>
          Значения поддерживают {"{{var.*}}"} и {"{{nickname}}"}.
        </FieldDescription>
        <div className="flex flex-col gap-2">
          {fields.map((field, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: порядок полей стабилен в рамках узла
            <div key={index} className="flex items-center gap-2">
              <Input
                value={field.key}
                onChange={(event) => updateField(index, { key: event.target.value })}
                placeholder="name"
                className="flex-1"
              />
              <Input
                value={field.value}
                onChange={(event) => updateField(index, { value: event.target.value })}
                placeholder="{{var.first_name}}"
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeField(index)}
                aria-label="Удалить поле"
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addField} className="mt-1">
          <PlusIcon className="size-4" /> Добавить поле
        </Button>
      </Field>
    </FieldGroup>
  );
}
