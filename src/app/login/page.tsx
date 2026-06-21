import { Suspense } from "react";

import { LoginForm } from "@/app/login/login-form";
import { isDevAuthSkip } from "@/lib/auth/dev-skip";

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-svh items-center justify-center">Загрузка…</div>}
    >
      <LoginForm devSkip={isDevAuthSkip()} />
    </Suspense>
  );
}
