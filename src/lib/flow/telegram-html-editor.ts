export type TelegramFormatTag = {
  id: string;
  label: string;
  open: string;
  close: string;
};

export const TELEGRAM_FORMAT_TAGS: TelegramFormatTag[] = [
  { id: "bold", label: "Жирный", open: "<b>", close: "</b>" },
  { id: "italic", label: "Курсив", open: "<i>", close: "</i>" },
  { id: "underline", label: "Подчёркнутый", open: "<u>", close: "</u>" },
  { id: "strike", label: "Зачёркнутый", open: "<s>", close: "</s>" },
  { id: "code", label: "Код", open: "<code>", close: "</code>" },
  {
    id: "spoiler",
    label: "Спойлер",
    open: "<tg-spoiler>",
    close: "</tg-spoiler>",
  },
  { id: "blockquote", label: "Цитата", open: "<blockquote>", close: "</blockquote>" },
  {
    id: "expandable_blockquote",
    label: "Сворачиваемая цитата",
    open: "<blockquote expandable>",
    close: "</blockquote>",
  },
];
