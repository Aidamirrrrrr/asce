import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { startSubscriptionCheckout } from "@/lib/billing/checkout";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  const rate = await enforceRateLimit(`billing:checkout:${authResult.userId}`, 10, 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { planId?: string };
  const planId = body.planId?.trim();
  if (!planId) {
    return NextResponse.json({ error: "Укажите тариф" }, { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
  const returnUrl = `${appUrl.replace(/\/$/, "")}/billing?status=return`;

  const result = await startSubscriptionCheckout({
    userId: authResult.userId,
    planId,
    returnUrl,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    confirmationUrl: result.confirmationUrl,
    paymentId: result.paymentId,
  });
}
