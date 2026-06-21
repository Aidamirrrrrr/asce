import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import type { ProjectChatMessage, ProjectSummary } from "@/lib/projects";

export type FlowGenerationStreamEvent =
  | { type: "status"; message: string }
  | { type: "queue"; position: number; message: string }
  | { type: "intent"; intent: "flow" | "data" | "chat" }
  | { type: "started"; project: ProjectSummary }
  | { type: "plan"; items: string[] }
  | { type: "plan_progress"; done: number[] }
  | { type: "flow"; flow: BotFlowDocument; nodeCount: number }
  | {
      type: "complete";
      project: ProjectSummary;
      assistantMessage: string;
      messages?: ProjectChatMessage[];
      flow?: BotFlowDocument;
      flowUpdated?: boolean;
      validationSummary?: string | null;
      stepLimitReached?: boolean;
    }
  | { type: "error"; message: string };

export function encodeFlowGenerationSse(event: FlowGenerationStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Текст плашки очереди на бете. */
export function betaQueueMessage(position: number): string {
  return position > 0
    ? `Ваш запрос в очереди из-за бета-теста (перед вами ${position}). Скоро начнём…`
    : "Ваш запрос в очереди из-за бета-теста. Скоро начнём…";
}

export async function consumeFlowGenerationStream(
  response: Response,
  handlers: {
    onStatus?: (message: string) => void;
    onQueue?: (message: string, position: number) => void;
    onIntent?: (intent: "flow" | "data" | "chat") => void;
    onStarted?: (project: ProjectSummary) => void;
    onPlan?: (items: string[]) => void;
    onPlanProgress?: (done: number[]) => void;
    onFlow?: (flow: BotFlowDocument, nodeCount: number) => void;
    onComplete?: (event: Extract<FlowGenerationStreamEvent, { type: "complete" }>) => void;
    onError?: (message: string) => void;
  },
  options?: { signal?: AbortSignal },
): Promise<void> {
  const signal = options?.signal;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!response.ok) {
    let message = "Не удалось выполнить запрос";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // ignore
    }
    handlers.onError?.(message);
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("Пустой ответ сервера");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const abortReader = () => {
    void reader.cancel();
  };

  signal?.addEventListener("abort", abortReader, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const line = chunk.split("\n").find((item) => item.startsWith("data: "));
        if (!line) {
          continue;
        }

        const payload = JSON.parse(line.slice(6)) as FlowGenerationStreamEvent;
        switch (payload.type) {
          case "status":
            handlers.onStatus?.(payload.message);
            break;
          case "queue":
            handlers.onQueue?.(payload.message, payload.position);
            break;
          case "intent":
            handlers.onIntent?.(payload.intent);
            break;
          case "started":
            handlers.onStarted?.(payload.project);
            break;
          case "plan":
            handlers.onPlan?.(payload.items);
            break;
          case "plan_progress":
            handlers.onPlanProgress?.(payload.done);
            break;
          case "flow":
            handlers.onFlow?.(payload.flow, payload.nodeCount);
            break;
          case "complete":
            handlers.onComplete?.(payload);
            break;
          case "error":
            handlers.onError?.(payload.message);
            throw new Error(payload.message);
        }
      }
    }
  } finally {
    signal?.removeEventListener("abort", abortReader);
  }
}
