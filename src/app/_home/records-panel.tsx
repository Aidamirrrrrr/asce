"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type RecordRow = {
  id: string;
  collection: string;
  data: Record<string, unknown>;
  userId: string | null;
  chatId: string | null;
  createdAt: string;
};

type CollectionInfo = { collection: string; count: number };

type RecordsResponse = {
  collections: CollectionInfo[];
  records: RecordRow[];
  error?: string;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function RecordsPanel({ projectId }: { projectId: string }) {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [active, setActive] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        const query = active ? `?collection=${encodeURIComponent(active)}` : "";
        const response = await fetch(`/api/projects/${projectId}/records${query}`);
        const data = (await response.json()) as RecordsResponse;
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setError(data.error ?? "Не удалось загрузить заявки");
          return;
        }
        setCollections(data.collections);
        setRecords(data.records);
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить заявки");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, active]);

  // Колонки таблицы — объединение ключей видимых записей.
  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const row of records) {
      for (const key of Object.keys(row.data)) {
        keys.add(key);
      }
    }
    return [...keys];
  }, [records]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-1">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="p-1 text-sm text-destructive">{error}</p>;
  }

  if (collections.length === 0) {
    return (
      <p className="p-1 text-sm text-muted-foreground">
        Пока нет собранных данных. Добавьте узел «Запись» (save_record) в сценарий — данные появятся
        здесь.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-1">
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant={active === undefined ? "default" : "outline"}
          size="sm"
          onClick={() => setActive(undefined)}
        >
          Все
        </Button>
        {collections.map((item) => (
          <Button
            key={item.collection}
            type="button"
            variant={active === item.collection ? "default" : "outline"}
            size="sm"
            onClick={() => setActive(item.collection)}
          >
            {item.collection} <span className="ml-1 tabular-nums opacity-70">{item.count}</span>
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-muted/95 text-xs text-muted-foreground">
            <tr>
              <th className="px-2.5 py-2 font-medium">Когда</th>
              {active === undefined ? <th className="px-2.5 py-2 font-medium">Коллекция</th> : null}
              {columns.map((column) => (
                <th key={column} className="px-2.5 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-muted-foreground">
                  {formatDate(row.createdAt)}
                </td>
                {active === undefined ? (
                  <td className="px-2.5 py-1.5 font-mono text-xs">{row.collection}</td>
                ) : null}
                {columns.map((column) => (
                  <td key={column} className="px-2.5 py-1.5">
                    {formatValue(row.data[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">Показаны последние {records.length} записей.</p>
    </div>
  );
}
