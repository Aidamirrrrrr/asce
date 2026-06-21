import { NextResponse } from "next/server";

import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string; token: string }>;
};

/** Публичная проверка билета по QR (ссылка из {{secret.VERIFY_BASE_URL}}/TOKEN). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, token } = await context.params;
    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    if (!token.trim()) {
      return NextResponse.json({ error: "Не указан код билета" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      projectId: project.id,
      projectName: project.name,
      token: token.trim(),
      valid: null,
      message:
        "Эндпоинт проверки билета активен. Привяжите сохранение заказов в сценарии, чтобы возвращать valid: true/false.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка проверки билета" },
      { status: 500 },
    );
  }
}
