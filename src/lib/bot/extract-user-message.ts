import type { Context } from "grammy";

/** Текст, телефон из контакта или координаты из геолокации — для wait_input и веток. */
export function extractInboundUserText(ctx: Context): string | null {
  const message = ctx.message;
  if (!message) {
    return null;
  }

  if (message.text) {
    return message.text;
  }

  const contact = message.contact;
  if (contact?.phone_number?.trim()) {
    return contact.phone_number.trim();
  }

  const location = message.location;
  if (location) {
    return `${location.latitude},${location.longitude}`;
  }

  return null;
}

export function formatContactForFlow(ctx: Context): string {
  const contact = ctx.message?.contact;
  if (!contact?.phone_number?.trim()) {
    return "[contact]";
  }

  const phone = contact.phone_number.trim();
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
  return name ? `${phone} (${name})` : phone;
}

export function formatLocationForFlow(ctx: Context): string {
  const location = ctx.message?.location;
  if (!location) {
    return "[location]";
  }

  return `${location.latitude},${location.longitude}`;
}
