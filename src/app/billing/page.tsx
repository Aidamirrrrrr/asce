import { redirect } from "next/navigation";
import { BillingClient } from "@/app/billing/billing-client";
import { auth } from "@/auth";
import { getQuotaStatus } from "@/lib/billing/ai-usage";
import { PLANS } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const quota = await getQuotaStatus(userId);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <BillingClient
        currentPlanId={quota.plan.id}
        usage={{
          period: quota.period,
          used: quota.used,
          limit: quota.limit,
          remaining: quota.remaining,
          exceeded: quota.exceeded,
        }}
        plans={Object.values(PLANS).map((plan) => ({
          id: plan.id,
          name: plan.name,
          priceRub: plan.priceRub,
          features: plan.features,
        }))}
      />
    </div>
  );
}
