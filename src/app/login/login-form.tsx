"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { Input } from "@/components/ui/input";

export function LoginForm({ devSkip = false }: { devSkip?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  async function requestCode() {
    setPending(true);
    try {
      const response = await fetch("/api/auth/email-code/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(payload.error ?? "Не удалось войти");
        return;
      }
      setStep("code");
      toast.success("Код отправлен на почту");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode() {
    setPending(true);
    try {
      const result = await signIn("email-code", {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        redirect: false,
        callbackUrl,
      });
      if (result?.error) {
        toast.error("Неверный или истёкший код");
        return;
      }
      router.push(result?.url ?? callbackUrl);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await (step === "password" ? requestCode() : verifyCode());
  }

  async function devLogin() {
    setPending(true);
    try {
      const result = await signIn("dev", { redirect: false, callbackUrl });
      if (result?.error) {
        toast.error("Dev-вход недоступен");
        return;
      }
      router.push(result?.url ?? callbackUrl);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-medium font-serif text-2xl tracking-tight">
            Вход в <GradientText>asce</GradientText>
          </h1>
          <p className="text-muted-foreground text-sm">
            {step === "password"
              ? "Email и пароль — затем код на почту"
              : `Код отправлен на ${email}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === "password" ? (
            <>
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
                placeholder="Пароль"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </>
          ) : (
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Код из письма (6 цифр)"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              required
            />
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Подождите…" : step === "password" ? "Продолжить" : "Войти"}
          </Button>

          {step === "code" ? (
            <button
              type="button"
              className="w-full text-center text-muted-foreground text-sm hover:text-foreground"
              onClick={() => {
                setStep("password");
                setCode("");
              }}
            >
              Назад
            </button>
          ) : null}
        </form>

        {step === "password" ? (
          <p className="text-center text-muted-foreground text-sm">
            Нет аккаунта?{" "}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              Зарегистрироваться
            </Link>
          </p>
        ) : null}

        {devSkip ? (
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            disabled={pending}
            onClick={devLogin}
          >
            Войти как разработчик (dev)
          </Button>
        ) : null}
      </div>
    </div>
  );
}
