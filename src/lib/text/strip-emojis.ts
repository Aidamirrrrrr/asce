// Base emoji ranges live in a character class; combining marks (variation
// selectors, ZWJ, keycap) are alternations so they aren't mixed with base
// characters in one class (lint/suspicious/noMisleadingCharacterClass).
const EMOJI_PATTERN =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]|[\u{FE00}-\u{FE0F}]|\u{200D}|\u{20E3}/gu;

export function stripTextEmojis(value: string): string {
  return value
    .replace(EMOJI_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

export function stripTextEmojisOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const stripped = stripTextEmojis(value);
  return stripped.length > 0 ? stripped : value.replace(EMOJI_PATTERN, "").trim();
}
