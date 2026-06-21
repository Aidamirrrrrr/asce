"use client";

import { MessageCircleHeartIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) {
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), contact: contact.trim() || undefined }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(payload.error ?? "Не удалось отправить отзыв");
        return;
      }
      toast.success("Спасибо! Отзыв отправлен");
      setMessage("");
      setContact("");
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2">
          <MessageCircleHeartIcon className="size-4" />
          Обратная связь
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-5 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="space-y-1">
            <DialogPrimitive.Title className="font-medium text-lg">
              Оставьте обратную связь
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-muted-foreground text-sm">
              Идёт бета. Расскажите, что понравилось или что сломалось — письмо придёт команде asce.
            </DialogPrimitive.Description>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <Textarea
              placeholder="Ваше сообщение…"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              required
              maxLength={4000}
            />
            <Input
              type="text"
              placeholder="Как с вами связаться (необязательно)"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Отмена
                </Button>
              </DialogPrimitive.Close>
              <Button type="submit" disabled={pending || !message.trim()}>
                {pending ? "Отправляем…" : "Отправить"}
              </Button>
            </div>
          </form>

          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Закрыть"
              className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
