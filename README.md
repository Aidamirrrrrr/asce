# asce

asce — ИИ-конструктор Telegram-ботов. Пользователь описывает бота словами, а система собирает визуальную схему из готовых нод и запускает её как настоящего Telegram-бота (через [grammY](https://grammy.dev)).

## Стек

- **Next.js 16** (App Router, React 19) — веб-интерфейс и API-роуты.
- **@xyflow/react** — визуальный редактор схемы (нод и связей).
- **Prisma + PostgreSQL** — хранение проектов, схем, секретов, пользователей бота и событий.
- **grammY** — рантайм Telegram-ботов (webhook по умолчанию в prod, polling в dev или при `BOT_DELIVERY_MODE=polling`).
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
- `SECRETS_ENC_KEY` — шифрование `botToken` и секретов проекта at-rest (обязателен в production).
- `REDIS_URL` — сессии бота и rate limiting (в dev без Redis — in-memory fallback).
- `BOT_DELIVERY_MODE` — `webhook` (по умолчанию в prod) или `polling` (нужен bot-worker).
- `S3_*` / `AWS_*` — S3-совместимое хранилище (MinIO, AWS S3) при `MEDIA_STORAGE_DRIVER=s3`.
- `SMTP_*` — вход по коду на email (без SMTP работает только пароль).
- `YOOKASSA_*` — оплата подписки на платформу (опционально).

## Production

### Railway

Конфиг деплоя — `railway.toml`. **Миграции не запускайте в build**: build-контейнер не видит `postgres.railway.internal`. Prisma применяется в `preDeployCommand` при деплое.

| Этап | Команда |
|------|---------|
| Build | `pnpm build` |
| Pre-deploy | `pnpm db:migrate:deploy` |
| Start | `pnpm start` |

Если в Railway Dashboard задан свой **Build Command** со старым `db:migrate:deploy` — удалите его или оставьте только `pnpm build`, иначе UI перебьёт `railway.toml`.

**Сервисы в проекте:**

1. **Web** — это приложение (подключить репозиторий).
2. **Bot-worker** (опционально, при `BOT_DELIVERY_MODE=polling`) — тот же репозиторий, **без публичного домена**, start: `pnpm start:worker`. Скопируйте env с web (`DATABASE_URL`, `REDIS_URL`, `SECRETS_ENC_KEY`, …) и добавьте `BOT_DELIVERY_MODE=polling`.
3. **PostgreSQL** — `DATABASE_URL=${{Postgres.DATABASE_URL}}` (internal URL, не PUBLIC).
4. **Redis** — `REDIS_URL=${{Redis.REDIS_URL}}`.
5. **MinIO** (или любой S3) — медиа-вложения ботов. Локальный диск (`MEDIA_STORAGE_DRIVER=local`) на Railway эфемерен: файлы пропадут при редеплое.

**Пример переменных (web-сервис):**

```env
NODE_ENV=production
APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}

# Надёжнее webhook на Railway: polling + отдельный bot-worker сервис.
BOT_DELIVERY_MODE=polling

DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

AUTH_SECRET=...          # openssl rand -base64 32
SECRETS_ENC_KEY=...      # openssl rand -base64 32
CRON_SECRET=...          # openssl rand -base64 32

AI_API_KEY=...
AI_BASE_URL=https://chat.immers.cloud/v1/endpoints/qwen3-coder-next-tensor/generate
AI_MODEL=Qwen3-Coder-Next
AI_MAX_CONCURRENCY=24
MAX_BETA_USERS=100

MEDIA_STORAGE_DRIVER=s3
S3_BUCKET=asce-media
S3_REGION=us-east-1
S3_ENDPOINT=http://${{MinIO.RAILWAY_PRIVATE_DOMAIN}}:9000
AWS_ACCESS_KEY_ID=${{MinIO.MINIO_ROOT_USER}}
AWS_SECRET_ACCESS_KEY=${{MinIO.MINIO_ROOT_PASSWORD}}

SMTP_HOST=mail.hosting.reg.ru
SMTP_PORT=465
SMTP_USER=hello@asce.tech
SMTP_PASS=...
SMTP_FROM=asce <hello@asce.tech>
```

Имена `${{MinIO.*}}` зависят от имени сервиса MinIO в Railway. Бакет из `S3_BUCKET` создаётся автоматически при первом обращении к хранилищу (нужны права на `CreateBucket` у `AWS_ACCESS_KEY_ID`). MinIO совместим с S3-драйвером (`S3_ENDPOINT` + `forcePathStyle`).

С кастомным доменом (`asce.tech`) задайте `APP_URL` и `AUTH_URL` явно — это важно для ссылок в письмах (и для webhook, если `BOT_DELIVERY_MODE=webhook`).

После переключения на polling: в редакторе **остановите и снова запустите** бота — webhook снимется, воркер подхватит `getUpdates` в течение ~2 с.

**Cron** (напоминания, отложенные задачи ботов) — раз в минуту:

```http
GET https://<APP_URL>/api/cron/process-jobs
Authorization: Bearer <CRON_SECRET>
```

В Railway: Cron Job или внешний планировщик.

**Health check:** `GET /api/health` → `{ "status": "ok" }`.

### Самостоятельный хостинг

#### 1. База данных

```bash
pnpm db:migrate:deploy   # prisma migrate deploy + generate
```

На чистой Postgres-базе применяется baseline-миграция `20260618120000_init_postgres_baseline`.

#### 2. Сборка и веб-процесс

```bash
pnpm build
pnpm start               # Next.js на порту 3000
```

Обязательные переменные: `DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, `SECRETS_ENC_KEY`, `AI_API_KEY`, `CRON_SECRET`, `NODE_ENV=production`. Для медиа в prod — `MEDIA_STORAGE_DRIVER=s3` и S3/MinIO-переменные (см. `.env.example`).

#### 3. Bot-worker (polling / отложенные задачи)

В production по умолчанию боты работают через **webhook** (Next.js API). Для **polling** задайте `BOT_DELIVERY_MODE=polling` и поднимите воркер:

```bash
pnpm start:worker   # BOT_WORKER_PROCESS=1, long polling + отложенные задачи
```

Отдельный воркер также полезен для:

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

#### 4. Health check

`GET /api/health` → `{ "status": "ok" }`.

## Полезные команды

- `pnpm dev` — дев-сервер (web + bot-worker).
- `pnpm dev:web` / `pnpm dev:worker` — компоненты по отдельности.
- `pnpm build` / `pnpm start` — продакшен-сборка и запуск.
- `pnpm start:worker` — bot-worker (polling в prod при `BOT_DELIVERY_MODE=polling`).
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
- `railway.toml` — команды build / pre-deploy / start для Railway.
- `scripts/bot-worker.ts` — фоновый воркер (polling sync + job processor).
