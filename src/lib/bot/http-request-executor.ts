import type { HttpRequestNodeData } from "@/lib/flow/flow-schema";
import type { TemplateVars } from "@/lib/flow/template-vars";
import { interpolateTemplate } from "@/lib/flow/template-vars";

const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpRequestResult = {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
};

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  if (normalized.includes(":")) {
    return true;
  }

  return isPrivateIpv4(normalized);
}

export function assertSafeHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Некорректный URL HTTP-запроса");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Разрешены только http и https URL");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error("Запрещённый адрес для HTTP-запроса");
  }

  return url;
}

async function readLimitedResponseBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      throw new Error("Ответ HTTP превышает допустимый размер");
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

export async function executeHttpRequestNode(
  data: HttpRequestNodeData,
  vars: TemplateVars,
): Promise<HttpRequestResult> {
  const interpolatedUrl = interpolateTemplate(data.url, vars, null);
  const timeoutMs = data.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const url = assertSafeHttpUrl(interpolatedUrl);
    const headers = new Headers();

    for (const header of data.headers ?? []) {
      headers.set(header.key, interpolateTemplate(header.value, vars, null));
    }

    const hasBody = data.method !== "GET" && data.method !== "DELETE";
    let body: string | undefined;
    if (hasBody && data.body !== undefined) {
      body = interpolateTemplate(data.body, vars, null);
      if (!headers.has("Content-Type")) {
        const trimmed = body.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          headers.set("Content-Type", "application/json");
        }
      }
    }

    const response = await fetch(url, {
      method: data.method,
      headers,
      body: hasBody ? body : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });

    const responseBody = await readLimitedResponseBody(response);
    const ok = response.status >= 200 && response.status < 300;

    return {
      ok,
      status: response.status,
      body: responseBody,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: "",
      error: error instanceof Error ? error.message : "Ошибка HTTP-запроса",
    };
  }
}
