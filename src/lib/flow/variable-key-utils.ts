const VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export function normalizeVariableKey(raw: string): string {
  return raw.trim().replace(/^var\./, "");
}

export function isValidVariableKey(key: string): boolean {
  return VARIABLE_KEY_PATTERN.test(normalizeVariableKey(key));
}
