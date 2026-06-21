import { Suspense } from "react";
import { HomePage } from "@/app/_home/home-page";
import { HomePageSkeleton } from "@/app/_home/home-page-skeleton";
import { LandingPage } from "@/app/_landing/landing-page";
import { auth } from "@/auth";
import { PageTransition } from "@/components/motion/page-transition";
import { db } from "@/lib/db";
import { serializeProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return <LandingPage />;
  }

  const projects = await db.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="h-svh overflow-hidden">
            <HomePageSkeleton />
          </div>
        }
      >
        <HomePage initialProjects={projects.map(serializeProject)} />
      </Suspense>
    </PageTransition>
  );
}
