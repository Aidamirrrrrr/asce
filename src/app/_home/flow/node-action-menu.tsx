"use client";

import { SettingsIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FlowNode } from "@/lib/flow/flow-schema";

const CLOSE_ANIMATION_MS = 120;

export type NodeActionMenuState = {
  node: FlowNode;
  x: number;
  y: number;
};

type NodeActionMenuProps = {
  menu: NodeActionMenuState | null;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: (node: FlowNode) => void;
  onDelete: (nodeId: string) => void;
};

export function NodeActionMenu({
  menu,
  onOpenChange,
  onOpenSettings,
  onDelete,
}: NodeActionMenuProps) {
  const [displayMenu, setDisplayMenu] = useState<NodeActionMenuState | null>(null);
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (menu) {
      clearTimeout(closeTimerRef.current);
      setDisplayMenu(menu);
      setOpen(true);
      return;
    }

    setOpen(false);
  }, [menu]);

  useEffect(() => {
    if (open || !displayMenu) {
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      setDisplayMenu(null);
    }, CLOSE_ANIMATION_MS);

    return () => {
      clearTimeout(closeTimerRef.current);
    };
  }, [open, displayMenu]);

  useEffect(() => {
    return () => {
      clearTimeout(closeTimerRef.current);
    };
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      onOpenChange(false);
    }
  }

  if (!displayMenu) {
    return null;
  }

  const label =
    typeof displayMenu.node.data.label === "string" ? displayMenu.node.data.label : "Узел";

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-px opacity-0"
          style={{ left: displayMenu.x, top: displayMenu.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="z-[110] w-44">
        <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            onOpenSettings(displayMenu.node);
          }}
        >
          <SettingsIcon />
          Настройки
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            onDelete(displayMenu.node.id);
          }}
        >
          <Trash2Icon />
          Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
