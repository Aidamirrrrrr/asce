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

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import type { FlowNodeType } from "@/lib/flow/flow-schema";

type NodePaletteProps = {
  onAddNode: (type: FlowNodeType) => void;
};

const paletteItems: Array<{
  type: FlowNodeType;
  label: string;
  icon: typeof ZapIcon;
}> = [
  { type: "trigger", label: "Триггер", icon: ZapIcon },
  { type: "message", label: "Сообщение", icon: MessageSquareIcon },
  { type: "condition", label: "Условие", icon: GitBranchIcon },
  { type: "set_variable", label: "Переменная", icon: VariableIcon },
  { type: "wait_input", label: "Ввод", icon: TextCursorInputIcon },
  { type: "http_request", label: "HTTP", icon: GlobeIcon },
  { type: "ai_reply", label: "AI-ответ", icon: SparklesIcon },
  { type: "admin_notify", label: "Админу", icon: BellRingIcon },
  { type: "json_extract", label: "JSON", icon: BracesIcon },
  { type: "save_record", label: "Запись", icon: DatabaseIcon },
  { type: "choice", label: "Выбор", icon: ListChecksIcon },
  { type: "jump", label: "Переход", icon: CornerRightDownIcon },
  { type: "form", label: "Форма", icon: ClipboardListIcon },
];

export function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <ButtonGroup className="pointer-events-auto rounded-xl border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur-sm">
        {paletteItems.map((item) => (
          <Button
            key={item.type}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAddNode(item.type)}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}
