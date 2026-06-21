import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { getMaxBetaUsers } from "@/lib/beta";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const name = body.name?.trim() || null;

    if (!(email && password)) {
      return NextResponse.json({ error: "Укажите email и пароль" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Пароль должен быть не короче 8 символов" },
        { status: 400 },
      );
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 409 },
      );
    }

    const maxBetaUsers = getMaxBetaUsers();
    if (maxBetaUsers > 0) {
      const userCount = await db.user.count();
      if (userCount >= maxBetaUsers) {
        return NextResponse.json(
          {
            error:
              "Бета-набор временно закрыт — мест больше нет. Напишите на hello@asce.tech, добавим в лист ожидания.",
            code: "beta_full",
          },
          { status: 403 },
        );
      }
    }

    const passwordHash = await hash(password, 12);
    const user = await db.user.create({
      data: { email, name, passwordHash },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось зарегистрироваться" },
      { status: 500 },
    );
  }
}
