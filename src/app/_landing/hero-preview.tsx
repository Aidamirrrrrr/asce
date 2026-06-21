"use client";

import { m } from "motion/react";
import { useRef, useState } from "react";

type Node = {
  id: string;
  x: number;
  y: number;
  w: number;
  label: string;
  sub: string;
  accent: string;
};

// Мини-схема бота записи — стилизована под холст проекта.
const NODES: Node[] = [
  { id: "start", x: 40, y: 24, w: 150, label: "/start", sub: "Триггер", accent: "bg-emerald-500" },
  {
    id: "msg1",
    x: 40,
    y: 104,
    w: 200,
    label: "Привет! Запишем вас",
    sub: "Сообщение",
    accent: "bg-sky-500",
  },
  {
    id: "cond",
    x: 70,
    y: 188,
    w: 170,
    label: "Выбор услуги",
    sub: "Условие",
    accent: "bg-amber-500",
  },
  {
    id: "save",
    x: 300,
    y: 150,
    w: 180,
    label: "Запись сохранена",
    sub: "save_record",
    accent: "bg-violet-500",
  },
  {
    id: "msg2",
    x: 300,
    y: 244,
    w: 180,
    label: "Ждём вас в студии",
    sub: "Сообщение",
    accent: "bg-sky-500",
  },
];

const EDGES: [string, string][] = [
  ["start", "msg1"],
  ["msg1", "cond"],
  ["cond", "save"],
  ["save", "msg2"],
];

function center(node: Node) {
  return { cx: node.x + node.w / 2, cy: node.y + 30 };
}

export function HeroPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 6, ry: -10 });

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: -py * 14, ry: px * 18 });
  }

  const nodeById = (id: string) => NODES.find((node) => node.id === id) as Node;

  return (
    <m.div
      className="[perspective:1200px]"
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 6, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
    >
      {/** biome-ignore lint/a11y/noStaticElementInteractions: декоративный 3D-превью, не интерактивный контрол */}
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={() => setTilt({ rx: 6, ry: -10 })}
        className="relative overflow-hidden rounded-xl bg-card shadow-2xl ring-1 ring-foreground/10 transition-transform duration-200 ease-out [transform-style:preserve-3d]"
        style={{ transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
      >
        {/* Блик */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-tr from-transparent via-transparent to-foreground/5"
        />
        {/* Шапка mac-окна */}
        <div className="flex items-center gap-2 border-foreground/10 border-b bg-muted/40 px-4 py-3">
          <span className="size-3 rounded-full bg-red-400" />
          <span className="size-3 rounded-full bg-yellow-400" />
          <span className="size-3 rounded-full bg-green-400" />
          <span className="ml-3 text-muted-foreground text-xs">asce · поток бота</span>
        </div>

        {/* Холст */}
        <div className="relative h-[320px] w-full text-foreground/10 [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:20px_20px]">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 520 320" aria-hidden="true">
            <title>Схема бота</title>
            {EDGES.map(([from, to]) => {
              const a = center(nodeById(from));
              const b = center(nodeById(to));
              const midX = (a.cx + b.cx) / 2;
              return (
                <path
                  key={`${from}-${to}`}
                  d={`M ${a.cx} ${a.cy} C ${midX} ${a.cy}, ${midX} ${b.cy}, ${b.cx} ${b.cy}`}
                  className="fill-none stroke-foreground/25"
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          {NODES.map((node) => (
            <div
              key={node.id}
              className="absolute rounded-lg bg-background/95 px-3 py-2 shadow-sm ring-1 ring-foreground/10"
              style={{ left: node.x, top: node.y, width: node.w }}
            >
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${node.accent}`} />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {node.sub}
                </span>
              </div>
              <div className="mt-0.5 truncate font-medium text-foreground text-sm">
                {node.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </m.div>
  );
}
