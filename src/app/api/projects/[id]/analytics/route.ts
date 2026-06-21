import { runQueued } from "@/lib/ai/ai-queue";
import {
  activeUsers,
  countUsers,
  errorsStats,
  eventsByType,
  messagesCount,
  newUsers,
  topCommands,
} from "@/lib/analytics/bot-analytics-queries";
import { answerAnalyticsQuestion } from "@/lib/analytics/qa-agent";
import { getOwnedProject, requireUser } from "@/lib/auth/session";
import { runWithAiUsage } from "@/lib/billing/ai-usage-context";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await context.params;
  const owned = await getOwnedProject(authResult.userId, id);
  if ("error" in owned) {
    return owned.error;
  }

  const [users, active7, active1, new7, messages7, byType, commands, errors] = await Promise.all([
    countUsers(id),
    activeUsers(id, 7),
    activeUsers(id, 1),
    newUsers(id, 7),
    messagesCount(id, { direction: "all", days: 7 }),
    eventsByType(id),
    topCommands(id, { limit: 5 }),
    errorsStats(id, { days: 7, limit: 5 }),
  ]);

  return Response.json({
    users,
    activeUsers: { day: active1.count, week: active7.count },
    newUsersLast7Days: new7.count,
    messagesLast7Days: messages7.count,
    eventsByType: byType.items,
    topCommands: commands.items,
    errorsLast7Days: errors.count,
    recentErrors: errors.recent,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await context.params;
  const owned = await getOwnedProject(authResult.userId, id);
  if ("error" in owned) {
    return owned.error;
  }

  const body = (await request.json()) as { question?: string };
  const question = body.question?.trim();

  if (!question) {
    return Response.json({ error: "Укажите вопрос" }, { status: 400 });
  }

  try {
    const result = await runWithAiUsage({ userId: authResult.userId, kind: "analytics_qa" }, () =>
      runQueued(() => answerAnalyticsQuestion(id, question)),
    );
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить ответ";
    return Response.json({ error: message }, { status: 500 });
  }
}
