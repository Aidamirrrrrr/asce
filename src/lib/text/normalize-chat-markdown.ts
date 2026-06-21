/**
 * AI often glues numbered steps into one paragraph ("…канал 1. Пользователь…").
 * Insert paragraph breaks so Markdown lists render in chat.
 */
export function normalizeChatMarkdown(content: string): string {
  let result = content.trim();

  result = result.replace(/([^\n])\s+(\d+)\.\s+/g, "$1\n\n$2. ");
  result = result.replace(/([^\n:])\s+-\s+/g, "$1\n\n- ");

  return result;
}
