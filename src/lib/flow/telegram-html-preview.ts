const TAG_RE =
  /<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|tg-spoiler)\b[^>]*>|<\/?blockquote\b[^>]*>/gi;

const BLOCKQUOTE_PREVIEW_CLASS =
  "telegram-blockquote my-1 block border-l-2 border-border pl-2 text-muted-foreground";

export const TELEGRAM_BLOCKQUOTE_CLASS = "telegram-blockquote";
export const TELEGRAM_BLOCKQUOTE_PREVIEW_CLASS = BLOCKQUOTE_PREVIEW_CLASS;

export function stripTelegramHtml(text: string): string {
  return text.replace(TAG_RE, "").replace(/<[^>]+>/g, "");
}

export function telegramHtmlToPreviewHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;(\/?)(b|strong)&gt;/gi, "<$1strong>")
    .replace(/&lt;(\/?)(i|em)&gt;/gi, "<$1em>")
    .replace(/&lt;(\/?)(u|ins)&gt;/gi, "<$1u>")
    .replace(/&lt;(\/?)(s|strike|del)&gt;/gi, "<$1s>")
    .replace(/&lt;code&gt;/gi, "<code>")
    .replace(/&lt;\/code&gt;/gi, "</code>")
    .replace(
      /&lt;blockquote expandable(?:="")?&gt;/gi,
      `<blockquote data-expandable class='${BLOCKQUOTE_PREVIEW_CLASS} telegram-blockquote telegram-blockquote-expandable'>`,
    )
    .replace(
      /&lt;blockquote&gt;/gi,
      `<blockquote class='${BLOCKQUOTE_PREVIEW_CLASS} telegram-blockquote'>`,
    )
    .replace(/&lt;\/blockquote&gt;/gi, "</blockquote>")
    .replace(/&lt;tg-spoiler&gt;/gi, "<span data-telegram-spoiler>")
    .replace(/&lt;\/tg-spoiler&gt;/gi, "</span>");
}

export function domHtmlToTelegramHtml(html: string): string {
  if (typeof document === "undefined") {
    return html;
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  const result = serializeTelegramChildren(container).replace(/\n$/, "");
  return result.trim() === "" ? "" : result;
}

function serializeTelegramChildren(parent: ParentNode): string {
  let out = "";
  for (const node of parent.childNodes) {
    out += serializeTelegramNode(node);
  }
  return out;
}

function serializeTelegramNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = serializeTelegramChildren(el);

  switch (tag) {
    case "b":
    case "strong":
      return `<b>${inner}</b>`;
    case "i":
    case "em":
      return `<i>${inner}</i>`;
    case "u":
    case "ins":
      return `<u>${inner}</u>`;
    case "s":
    case "strike":
    case "del":
      return `<s>${inner}</s>`;
    case "code":
      return `<code>${inner}</code>`;
    case "blockquote": {
      const expandable = el.hasAttribute("data-expandable");
      return expandable
        ? `<blockquote expandable>${inner}</blockquote>`
        : `<blockquote>${inner}</blockquote>`;
    }
    case "br":
      return "\n";
    case "div":
    case "p":
      return inner ? `${inner}\n` : "\n";
    case "span":
      if (el.hasAttribute("data-telegram-spoiler")) {
        return `<tg-spoiler>${inner}</tg-spoiler>`;
      }
      return inner;
    default:
      return inner;
  }
}
