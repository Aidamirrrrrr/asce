export function extractJsonFromAiResponse(raw: string): string {
  const trimmed = raw.trim();
  const completeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (completeFence?.[1]) {
    return completeFence[1].trim();
  }

  const inlineFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (inlineFence?.[1]) {
    return inlineFence[1].trim();
  }

  return trimmed;
}

export function unescapeJsonStringFragment(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

export function extractCompleteJsonObjectsFromArray(buffer: string, arrayKey: string): unknown[] {
  const keyPattern = new RegExp(`"${arrayKey}"\\s*:\\s*\\[`);
  const match = keyPattern.exec(buffer);
  if (!match) {
    return [];
  }

  let index = match.index + match[0].length;
  const objects: unknown[] = [];

  while (index < buffer.length) {
    while (index < buffer.length && /[\s,]/.test(buffer[index]!)) {
      index += 1;
    }

    if (index >= buffer.length || buffer[index] === "]") {
      break;
    }

    if (buffer[index] !== "{") {
      break;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    const start = index;

    for (; index < buffer.length; index += 1) {
      const char = buffer[index]!;

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          try {
            objects.push(JSON.parse(buffer.slice(start, index)));
          } catch {
            // incomplete object
          }
          break;
        }
      }
    }
  }

  return objects;
}
