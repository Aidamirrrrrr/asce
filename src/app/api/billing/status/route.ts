import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { isBillingEnforced } from "@/lib/beta";
import { getQuotaStatus } from "@/lib/billing/ai-usage";
import { PLANS } from "@/lib/billing/plans";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  const quota = await getQuotaStatus(authResult.userId);
  const billingEnforced = isBillingEnforced();

  return NextResponse.json({
    betaMode: !billingEnforced,
    plan: {
      id: quota.plan.id,
      name: quota.plan.name,
      priceRub: quota.plan.priceRub,
      maxProjects: quota.plan.maxProjects,
    },
    usage: {
      period: quota.period,
      tokensUsed: quota.used,
      tokensLimit: quota.limit,
      tokensRemaining: quota.remaining,
      exceeded: quota.exceeded,
      unlimited: quota.unlimited,
    },
    availablePlans: billingEnforced
      ? Object.values(PLANS).map((plan) => ({
          id: plan.id,
          name: plan.name,
          priceRub: plan.priceRub,
          monthlyTokenQuota: plan.monthlyTokenQuota,
          maxProjects: plan.maxProjects,
          features: plan.features,
        }))
      : [],
  });
}
