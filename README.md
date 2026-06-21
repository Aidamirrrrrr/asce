# asce

asce — ИИ-конструктор Telegram-ботов. Пользователь описывает бота словами, а система собирает визуальную схему из готовых нод и запускает её как настоящего Telegram-бота (через [grammY](https://grammy.dev)).

## Стек

- **Next.js 16** (App Router, React 19) — веб-интерфейс и API-роуты.
- **@xyflow/react** — визуальный редактор схемы (нод и связей).
- **Prisma + PostgreSQL** — хранение проектов, схем, секретов, пользователей бота и событий.
- **grammY** — рантайм Telegram-ботов (webhook в проде, polling в dev).
- **OpenAI-совместимый ИИ-эндпоинт** (бета: Immers.cloud Qwen3-Coder) — генерация и доработка схем, ответы аналитического агента.
- **shadcn/ui + Tailwind CSS 4** — UI-компоненты.

## Быстрый старт (dev)

```bash
pnpm install
cp .env.example .env   # заполните AI_API_KEY и при необходимости остальное
```

Поднимите PostgreSQL (пример через Docker):

```bash
docker run -d --name tbb-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=telegram_bot_builder \
  -p 5432:5432 \
  postgres:16-alpine
```

Примените миграции и запустите приложение:

```bash
pnpm db:migrate        # prisma migrate dev + generate
pnpm dev               # Next.js + bot-worker (polling в dev)
```

Откройте [http://localhost:3000](http://localhost:3000).

## Переменные окружения

См. `.env.example`. Ключевые:

- `DATABASE_URL` — строка подключения PostgreSQL (`postgresql://user:pass@host:5432/db?schema=public`).
- `APP_URL` — публичный URL приложения (нужен для Telegram webhook и внешних ссылок).
- `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` — доступ к ИИ.
- `MEDIA_STORAGE_DRIVER` — `local` (dev) или `s3` (prod) для медиа-вложений.
- `CRON_SECRET` — Bearer-токен для эндпоинта обработки отложенных задач (обязателен в production).
- `AUTH_SECRET` — секрет сессий Auth.js (обязателен в production).
- `AUTH_URL` — публичный URL приложения для Auth.js (обычно совпадает с `APP_URL`).

## Production

### 1. База данных

```bash
pnpm db:migrate:deploy   # prisma migrate deploy + generate
```

На чистой Postgres-базе применяется baseline-миграция `20260618120000_init_postgres_baseline`.

### 2. Сборка и веб-процесс

```bash
pnpm build
pnpm start               # Next.js на порту 3000
```

На Railway миграции выполняются в `preDeployCommand` (`railway.toml`), не во время build.

Переменные: `DATABASE_URL`, `APP_URL`, `AI_API_KEY`, `CRON_SECRET`, `NODE_ENV=production`.

### 3. Bot-worker (polling / отложенные задачи)

В production боты работают через **webhook** (Next.js API). Отдельный воркер нужен для:

- обработки отложенных задач (`ScheduledFlowJob`), если не используется внешний cron;
- polling-режима в dev (запускается автоматически через `pnpm dev`).

Пример systemd-юнита для воркера:

```ini
[Unit]
Description=asce worker
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/asce
Environment=NODE_ENV=production
Environment=BOT_WORKER_PROCESS=1
EnvironmentFile=/opt/asce/.env
ExecStart=/usr/bin/pnpm exec tsx scripts/bot-worker.ts
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Альтернатива — внешний cron, вызывающий `GET /api/cron/process-jobs` с заголовком `Authorization: Bearer $CRON_SECRET`.

### 4. Health check

`GET /api/health` → `{ "status": "ok" }`.

## Полезные команды

- `pnpm dev` — дев-сервер (web + bot-worker).
- `pnpm dev:web` / `pnpm dev:worker` — компоненты по отдельности.
- `pnpm build` / `pnpm start` — продакшен-сборка и запуск.
- `pnpm lint` / `pnpm lint:fix` — проверка/автофикс через Biome.
- `pnpm test` — юнит-тесты (Vitest).
- `pnpm db:migrate` — миграции в dev (`migrate dev`).
- `pnpm db:migrate:deploy` — миграции в prod (`migrate deploy`).
- `pnpm db:studio` — Prisma Studio.

## Структура

- `src/app/_home` — основной UI редактора (холст, инспектор, чат-композер).
- `src/app/api` — API-роуты (проекты, генерация, Telegram webhook, cron).
- `src/lib/ai` — генерация и доработка схем через ИИ.
- `src/lib/flow` — схема нод, нормализация, раскладка, валидация.
- `src/lib/bot` — рантайм бота: исполнение схемы, сессии, отложенные задачи.
- `prisma` — схема БД и миграции.
- `scripts/bot-worker.ts` — фоновый воркер (polling sync + job processor).
