import { NextResponse } from "next/server";

import { processDueJobs } from "@/lib/bot/scheduled-jobs";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    logger.error("cron_secret_missing");
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const processed = await processDueJobs();
    logger.info("cron_jobs_processed", { processed });
    return NextResponse.json({ status: "ok", processed });
  } catch (error) {
    logger.error("cron_jobs_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Неизвестная ошибка",
      },
      { status: 500 },
    );
  }
}
