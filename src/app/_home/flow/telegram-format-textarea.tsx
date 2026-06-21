"use client";

import {
  BoldIcon,
  ChevronDownIcon,
  CodeIcon,
  EyeOffIcon,
  ItalicIcon,
  StrikethroughIcon,
  TextQuoteIcon,
  UnderlineIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { TELEGRAM_FORMAT_TAGS, type TelegramFormatTag } from "@/lib/flow/telegram-html-editor";
import {
  domHtmlToTelegramHtml,
  stripTelegramHtml,
  TELEGRAM_BLOCKQUOTE_PREVIEW_CLASS,
  telegramHtmlToPreviewHtml,
} from "@/lib/flow/telegram-html-preview";
import { truncateTelegramPlainText } from "@/lib/flow/telegram-limits";
import { duration, gentleEase } from "@/lib/motion";
import { cn } from "@/lib/utils";

import "./telegram-format-editor.css";

const FORMAT_ICONS: Record<string, typeof BoldIcon> = {
  bold: BoldIcon,
  italic: ItalicIcon,
  underline: UnderlineIcon,
  strike: StrikethroughIcon,
  code: CodeIcon,
  spoiler: EyeOffIcon,
  blockquote: TextQuoteIcon,
  expandable_blockquote: ChevronDownIcon,
};

const FORMAT_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "INS", "S", "STRIKE", "DEL", "CODE"]);

function isFormatElement(el: Element): boolean {
  if (FORMAT_TAGS.has(el.tagName)) {
    return true;
  }

  if (el.tagName === "FONT") {
    return true;
  }

  if (el.tagName === "SPAN") {
    const htmlEl = el as HTMLElement;
    if (htmlEl.hasAttribute("data-telegram-spoiler")) {
      return true;
    }

    const fontWeight = htmlEl.style.fontWeight;
    if (fontWeight === "bold" || fontWeight === "700" || Number(fontWeight) >= 600) {
      return true;
    }
    if (htmlEl.style.fontStyle === "italic") {
      return true;
    }
    if (htmlEl.style.textDecoration.includes("underline")) {
      return true;
    }
    if (htmlEl.style.textDecoration.includes("line-through")) {
      return true;
    }
  }

  return false;
}

function getPlainEditorText(editor: HTMLElement): string {
  return (editor.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .trim();
}

function isEditorEmpty(editor: HTMLElement): boolean {
  if (getPlainEditorText(editor)) {
    return false;
  }

  const telegram = domHtmlToTelegramHtml(editor.innerHTML);
  return !stripTelegramHtml(telegram).trim();
}

function pruneEmptyFormatNodes(editor: HTMLElement) {
  const selector =
    "b, strong, i, em, u, ins, s, strike, del, code, font, [data-telegram-spoiler], span";

  let changed = true;
  while (changed) {
    changed = false;
    for (const el of [...editor.querySelectorAll(selector)].reverse()) {
      const htmlEl = el as HTMLElement;
      if (htmlEl === editor) {
        continue;
      }
      if (
        el.tagName === "SPAN" &&
        !isFormatElement(el) &&
        !htmlEl.querySelector("[data-telegram-spoiler]")
      ) {
        continue;
      }
      if (!getPlainEditorText(htmlEl)) {
        el.remove();
        changed = true;
      }
    }
  }
}

function clearEditor(editor: HTMLElement) {
  editor.innerHTML = "";
}

function findOutermostFormatElement(node: Node | null, root: HTMLElement): Element | null {
  let outermost: Element | null = null;
  let current: Node | null = node;

  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE && isFormatElement(current as Element)) {
      outermost = current as Element;
    }
    current = current.parentNode;
  }

  return outermost;
}

function exitFormattingOnBoundary(editor: HTMLElement, boundary: "space" | "line"): boolean {
  const selection = window.getSelection();
  if (!(selection?.rangeCount && selection.isCollapsed)) {
    return false;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) {
    return false;
  }

  const formatEl = findOutermostFormatElement(range.startContainer, editor);
  if (!formatEl?.parentNode) {
    return false;
  }

  const tailRange = document.createRange();
  tailRange.setStart(range.startContainer, range.startOffset);
  tailRange.setEnd(formatEl, formatEl.childNodes.length);

  const tail = tailRange.collapsed ? null : tailRange.extractContents();
  const boundaryNode =
    boundary === "space" ? document.createTextNode(" ") : document.createElement("br");
  formatEl.parentNode.insertBefore(boundaryNode, formatEl.nextSibling);

  if (tail?.textContent) {
    boundaryNode.parentNode?.insertBefore(tail, boundaryNode.nextSibling);
  }

  if (!getPlainEditorText(formatEl as HTMLElement)) {
    formatEl.remove();
  }

  const nextRange = document.createRange();
  if (boundary === "space") {
    nextRange.setStart(boundaryNode, 1);
  } else {
    nextRange.setStartAfter(boundaryNode);
  }
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  return true;
}

function wrapCodeRange(range: Range): HTMLElement | null {
  const text = range.toString();
  if (!text) {
    return null;
  }

  const el = document.createElement("code");
  el.textContent = text;
  range.deleteContents();
  range.insertNode(el);
  return el;
}

function wrapSpoilerRange(range: Range): HTMLElement | null {
  const el = document.createElement("span");
  el.setAttribute("data-telegram-spoiler", "");

  try {
    range.surroundContents(el);
  } catch {
    try {
      const fragment = range.extractContents();
      el.appendChild(fragment);
      range.insertNode(el);
    } catch {
      return null;
    }
  }

  return el;
}

function wrapBlockquoteRange(range: Range, expandable: boolean): HTMLElement | null {
  const el = document.createElement("blockquote");
  el.className = expandable
    ? `${TELEGRAM_BLOCKQUOTE_PREVIEW_CLASS} telegram-blockquote-expandable`
    : TELEGRAM_BLOCKQUOTE_PREVIEW_CLASS;
  if (expandable) {
    el.setAttribute("data-expandable", "");
  }

  try {
    range.surroundContents(el);
  } catch {
    try {
      const fragment = range.extractContents();
      el.appendChild(fragment);
      range.insertNode(el);
    } catch {
      return null;
    }
  }

  return el;
}

function decorateEditorStructure(editor: HTMLElement) {
  for (const blockquote of editor.querySelectorAll("blockquote")) {
    const htmlBlockquote = blockquote as HTMLElement;
    const expandable = htmlBlockquote.hasAttribute("data-expandable");
    const expectedClass = expandable
      ? `${TELEGRAM_BLOCKQUOTE_PREVIEW_CLASS} telegram-blockquote-expandable`
      : TELEGRAM_BLOCKQUOTE_PREVIEW_CLASS;

    if (htmlBlockquote.className !== expectedClass) {
      htmlBlockquote.className = expectedClass;
    }
  }
}

function needsStructureRestore(el: HTMLElement, telegram: string): boolean {
  if (!telegram.trim()) {
    return false;
  }

  if (isEditorEmpty(el)) {
    return true;
  }

  if (telegram.includes("<blockquote") && !el.querySelector("blockquote")) {
    return true;
  }

  if (telegram.includes("<tg-spoiler") && !el.querySelector("[data-telegram-spoiler]")) {
    return true;
  }

  if (telegram.includes("<code>") && !el.querySelector("code")) {
    return true;
  }

  return false;
}

function getPreviewHtml(telegram: string): string {
  return telegram ? telegramHtmlToPreviewHtml(telegram) : "";
}

type TelegramFormatTextareaProps = Omit<HTMLAttributes<HTMLDivElement>, "value" | "onChange"> & {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxPlainTextLength?: number;
};

export type TelegramFormatTextareaHandle = {
  insertText: (text: string) => void;
  focus: () => void;
};

export const TelegramFormatTextarea = forwardRef<
  TelegramFormatTextareaHandle,
  TelegramFormatTextareaProps
>(function TelegramFormatTextarea(
  { id, value, onChange, className, placeholder, maxPlainTextLength, onBlur, onFocus, ...props },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastEmittedValueRef = useRef(value);
  const [hasSelection, setHasSelection] = useState(false);
  const [toolbarTop, setToolbarTop] = useState(0);
  const [focused, setFocused] = useState(false);
  const showPlaceholder = !value.trim() && Boolean(placeholder);

  const restoreEditorHtml = useCallback((telegram: string) => {
    const el = editorRef.current;
    if (!el) {
      return;
    }

    const nextHtml = getPreviewHtml(telegram);
    if (nextHtml) {
      el.innerHTML = nextHtml;
    } else {
      clearEditor(el);
    }

    decorateEditorStructure(el);
  }, []);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) {
      return;
    }

    const isFocused = document.activeElement === el;

    if (isFocused) {
      if (value === lastEmittedValueRef.current && needsStructureRestore(el, value)) {
        restoreEditorHtml(value);
      } else {
        decorateEditorStructure(el);
      }
      return;
    }

    const serialized = domHtmlToTelegramHtml(el.innerHTML);
    if (serialized !== value || needsStructureRestore(el, value)) {
      restoreEditorHtml(value);
    }
  }, [value, restoreEditorHtml]);

  const syncEditorState = useCallback(() => {
    const el = editorRef.current;
    if (!el) {
      return;
    }

    pruneEmptyFormatNodes(el);

    if (isEditorEmpty(el)) {
      clearEditor(el);
      onChange("");
      savedRangeRef.current = null;
      setHasSelection(false);
      return;
    }

    const raw = domHtmlToTelegramHtml(el.innerHTML);
    const next =
      maxPlainTextLength !== undefined ? truncateTelegramPlainText(raw, maxPlainTextLength) : raw;

    if (next !== raw) {
      el.innerHTML = next ? telegramHtmlToPreviewHtml(next) : "";
    }

    lastEmittedValueRef.current = next;
    onChange(next);

    if (needsStructureRestore(el, next)) {
      restoreEditorHtml(next);
    } else {
      decorateEditorStructure(el);
    }
  }, [maxPlainTextLength, onChange, restoreEditorHtml]);

  useImperativeHandle(
    ref,
    () => ({
      insertText(text: string) {
        const editor = editorRef.current;
        if (!editor) {
          return;
        }

        editor.focus();
        const selection = window.getSelection();

        if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(text);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          editor.appendChild(document.createTextNode(text));
        }

        syncEditorState();
      },
      focus() {
        editorRef.current?.focus();
      },
    }),
    [syncEditorState],
  );

  const restoreSavedSelection = useCallback(() => {
    const editor = editorRef.current;
    const savedRange = savedRangeRef.current;
    const selection = window.getSelection();

    if (!(editor && savedRange && selection)) {
      return false;
    }

    editor.focus();
    selection.removeAllRanges();
    selection.addRange(savedRange.cloneRange());
    return !selection.isCollapsed;
  }, []);

  const updateSelection = useCallback(() => {
    const el = editorRef.current;
    const selection = window.getSelection();

    if (
      !(el && selection) ||
      selection.isCollapsed ||
      !selection.rangeCount ||
      !el.contains(selection.anchorNode)
    ) {
      savedRangeRef.current = null;
      setHasSelection(false);
      return;
    }

    const range = selection.getRangeAt(0);
    savedRangeRef.current = range.cloneRange();
    const rect = range.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();
    setToolbarTop(rect.top - containerRect.top + el.scrollTop);
    setHasSelection(true);
  }, []);

  useEffect(() => {
    if (!hasSelection) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (toolbarRef.current?.contains(target)) {
        return;
      }
      if (editorRef.current?.contains(target)) {
        return;
      }
      savedRangeRef.current = null;
      setHasSelection(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [hasSelection]);

  function closeToolbar() {
    savedRangeRef.current = null;
    setHasSelection(false);
    window.getSelection()?.removeAllRanges();
  }

  function applyFormat(tag: TelegramFormatTag) {
    if (!restoreSavedSelection()) {
      return;
    }

    const selection = window.getSelection();
    if (!selection?.rangeCount) {
      return;
    }

    const range = selection.getRangeAt(0);

    switch (tag.id) {
      case "bold":
        document.execCommand("bold");
        break;
      case "italic":
        document.execCommand("italic");
        break;
      case "underline":
        document.execCommand("underline");
        break;
      case "strike":
        document.execCommand("strikeThrough");
        break;
      case "code":
        wrapCodeRange(range);
        break;
      case "spoiler":
        wrapSpoilerRange(range);
        break;
      case "blockquote":
        wrapBlockquoteRange(range, false);
        break;
      case "expandable_blockquote":
        wrapBlockquoteRange(range, true);
        break;
    }

    syncEditorState();
    closeToolbar();
  }

  function handleEditorClick(event: MouseEvent<HTMLDivElement>) {
    const spoiler = (event.target as HTMLElement).closest<HTMLElement>("[data-telegram-spoiler]");
    if (!(spoiler && editorRef.current?.contains(spoiler))) {
      return;
    }

    if (spoiler.hasAttribute("data-revealed")) {
      spoiler.removeAttribute("data-revealed");
      return;
    }

    event.preventDefault();
    spoiler.setAttribute("data-revealed", "");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const boundary =
      event.key === " " ? "space" : event.key === "Enter" && !event.shiftKey ? "line" : null;

    if (!boundary) {
      return;
    }

    if (exitFormattingOnBoundary(editor, boundary)) {
      event.preventDefault();
      syncEditorState();
    }
  }

  function handleEditorInput() {
    syncEditorState();
    updateSelection();
  }

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence initial={false}>
        {hasSelection ? (
          <motion.div
            ref={toolbarRef}
            key="format-toolbar"
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              top: Math.max(8, toolbarTop - 44),
            }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: duration.fast, ease: gentleEase }}
            className="absolute right-2 z-30 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md ring-1 ring-foreground/10"
            onMouseDown={(event) => event.preventDefault()}
          >
            {TELEGRAM_FORMAT_TAGS.map((tag) => {
              const Icon = FORMAT_ICONS[tag.id] ?? BoldIcon;

              return (
                <button
                  key={tag.id}
                  type="button"
                  title={tag.label}
                  aria-label={tag.label}
                  onClick={() => applyFormat(tag)}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        className={cn(
          "relative rounded-lg border border-input bg-transparent transition-colors dark:bg-input/30",
          focused && "border-ring ring-3 ring-ring/50",
        )}
      >
        {showPlaceholder ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 px-2.5 py-2 text-base text-muted-foreground md:text-sm"
          >
            {placeholder}
          </div>
        ) : null}

        {/* biome-ignore lint/a11y/useSemanticElements: rich Telegram formatting requires a contentEditable surface; a native <textarea> cannot render inline styling */}
        <div
          ref={editorRef}
          id={id}
          contentEditable
          suppressContentEditableWarning
          tabIndex={0}
          role="textbox"
          aria-multiline
          aria-placeholder={placeholder}
          spellCheck={false}
          onInput={handleEditorInput}
          onClick={handleEditorClick}
          onKeyDown={handleKeyDown}
          onMouseUp={updateSelection}
          onKeyUp={updateSelection}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            window.setTimeout(() => {
              if (!toolbarRef.current?.contains(document.activeElement)) {
                savedRangeRef.current = null;
                setHasSelection(false);
              }
            }, 120);
            onBlur?.(event);
          }}
          className="telegram-format-editor min-h-28 w-full whitespace-pre-wrap break-words px-2.5 py-2 text-base outline-none md:text-sm"
          {...props}
        />
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        Выделите текст, появится панель форматирования. Пробел или Enter завершают текущее
        форматирование. Спойлер размыт: наведите или нажмите, чтобы раскрыть.
      </p>
    </div>
  );
});
