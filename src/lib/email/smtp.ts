import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP-отправка (почтовый сервер на reg.ru). Настройки из env:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 */
let cached: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim(),
  );
}

function getTransport(): Transporter {
  if (cached) {
    return cached;
  }
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!(host && user && pass)) {
    throw new Error("SMTP не настроен (SMTP_HOST/SMTP_USER/SMTP_PASS)");
  }
  const port = Number(process.env.SMTP_PORT ?? "465");

  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // reg.ru: 465 (SSL) или 587 (STARTTLS)
    auth: { user, pass },
  });
  return cached;
}

export function getMailFrom(): string {
  return process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || "hello@asce.tech";
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const transport = getTransport();
  await transport.sendMail({
    from: getMailFrom(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
