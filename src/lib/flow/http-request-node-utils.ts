import type {
  HttpRequestHeader,
  HttpRequestMethod,
  HttpRequestNodeData,
} from "@/lib/flow/flow-schema";
import { normalizeVariableKey } from "@/lib/flow/variable-key-utils";

export const HTTP_REQUEST_SOURCE_HANDLES = ["success", "error"] as const;

export type HttpRequestSourceHandle = (typeof HTTP_REQUEST_SOURCE_HANDLES)[number];

const HTTP_METHODS: HttpRequestMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function normalizeHttpRequestNodeData(raw: unknown): HttpRequestNodeData {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const label = typeof data.label === "string" ? data.label : "HTTP-запрос";
  const method = HTTP_METHODS.includes(data.method as HttpRequestMethod)
    ? (data.method as HttpRequestMethod)
    : "GET";
  const url = typeof data.url === "string" ? data.url : "https://api.example.com";
  const headers = normalizeHttpHeaders(data.headers);
  const body = typeof data.body === "string" ? data.body : undefined;
  const responseVariable =
    typeof data.responseVariable === "string"
      ? normalizeVariableKey(data.responseVariable)
      : undefined;
  const responseStatusVariable =
    typeof data.responseStatusVariable === "string"
      ? normalizeVariableKey(data.responseStatusVariable)
      : undefined;
  const timeoutMs =
    typeof data.timeoutMs === "number" && Number.isFinite(data.timeoutMs)
      ? Math.min(30_000, Math.max(1_000, Math.floor(data.timeoutMs)))
      : undefined;

  return {
    label,
    method,
    url,
    ...(headers.length > 0 ? { headers } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(responseVariable ? { responseVariable } : {}),
    ...(responseStatusVariable ? { responseStatusVariable } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

function normalizeHttpHeaders(raw: unknown): HttpRequestHeader[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const header = item as Partial<HttpRequestHeader>;
      const key = typeof header.key === "string" ? header.key.trim() : "";
      const value = typeof header.value === "string" ? header.value : "";
      if (!key) {
        return null;
      }

      return { key, value };
    })
    .filter((header): header is HttpRequestHeader => header !== null);
}

export function isValidHttpRequestSourceHandle(
  handleId: string | null | undefined,
): handleId is HttpRequestSourceHandle {
  return handleId === "success" || handleId === "error";
}

export function buildHttpRequestPreview(data: HttpRequestNodeData): string {
  const url = data.url.trim() || "https://...";
  const response = data.responseVariable ? ` -> var.${data.responseVariable}` : "";
  return `${data.method} ${url}${response}`;
}
