"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { Input } from "@/components/ui/input";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name || undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(payload.error ?? "Не удалось зарегистрироваться");
        return;
      }
      toast.success("Аккаунт создан. Войдите — придёт код на почту.");
      router.push("/login");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-medium font-serif text-2xl tracking-tight">
            Регистрация в <GradientText>asce</GradientText>
          </h1>
          <p className="text-muted-foreground text-sm">
            Открытая бета — доступ бесплатный, число мест ограничено
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            placeholder="Имя (необязательно)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
          <Input
            type="password"
            placeholder="Пароль (минимум 8 символов)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Подождите…" : "Создать аккаунт"}
          </Button>
        </form>

        <p className="text-center text-muted-foreground text-sm">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
