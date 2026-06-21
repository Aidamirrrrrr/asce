import "dotenv/config";

import { runBotPollingWorker } from "@/lib/bot/polling-worker";
import { acquireBotWorkerLock } from "@/lib/bot/worker-lock";

process.env.BOT_WORKER_PROCESS = "1";

if (!acquireBotWorkerLock()) {
  process.exit(1);
}

runBotPollingWorker();
