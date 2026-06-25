# asce

**asce** — платформа для создания Telegram-ботов без программирования. Вы описываете бота обычными словами, ИИ собирает визуальную схему из готовых блоков, а платформа запускает её как настоящего бота в Telegram (через [grammY](https://grammy.dev)).

Сайт: [asce.tech](https://asce.tech)

---

## О продукте

### Для кого

asce рассчитан на владельцев малого бизнеса, маркетологов, администраторов сообществ и всех, кому нужен рабочий Telegram-бот, но нет времени или навыков писать код. Вместо настройки серверов, деплоя и фреймворков — браузер, текстовое описание и токен от [@BotFather](https://t.me/BotFather).

### Идея

Классический no-code для ботов часто сводится к жёстким шаблонам. asce сочетает **генерацию сценария через ИИ** с **визуальным редактором**: схема прозрачна, её можно править вручную на холсте или дорабатывать новыми сообщениями в чате. Один проект = один бот со своей логикой, секретами, аналитикой и (при необходимости) приёмом оплаты.

### Как это работает

1. **Опишите бота словами** — например: «Бот для записи в барбершоп с выбором мастера, сбором телефона и напоминанием».
2. **ИИ собирает схему** — на холсте появляются ноды (сообщения, кнопки, условия, формы, записи в базу и т.д.) и связи между ними. Схему можно править вручную или уточнять текстом в чате.
3. **Подключите токен и запустите** — вставьте `botToken` от BotFather, нажмите «Запустить». Бот начинает отвечать пользователям в Telegram; платформа принимает обновления через webhook или polling.

Весь цикл — от идеи до работающего бота — происходит в веб-интерфейсе, без установки Node.js у конечного пользователя.

---

## Возможности

| Область | Что умеет |
|--------|-----------|
| **ИИ-конструктор** | Создание и доработка сценария по текстовому описанию; очередь запросов при высокой нагрузке |
| **Визуальный холст** | Редактор на [@xyflow/react](https://reactflow.dev): ноды, связи, инспектор полей, превью сообщений |
| **Чат с проектом** | История диалога с ИИ, откат к предыдущей версии схемы |
| **Запуск бота** | grammY-рантайм: webhook (prod по умолчанию) или polling (dev / Railway) |
| **Заявки и записи** | Встроенное хранилище (`save_record`): лиды, заказы, брони — без внешней CRM |
| **Уведомления** | Отправка сообщений админу или в группу заявок (`admin_notify`) |
| **Платежи** | Ссылка на оплату через API провайдера (ЮKassa и др.) — не нативные Telegram-инвойсы |
| **Аналитика** | Метрики пользователей, команд, ошибок; ИИ-агент отвечает на вопросы по данным бота |
| **Секреты** | Шифрование токенов и API-ключей at-rest; шаблоны `{{secret.KEY}}` в схеме |
| **Медиа** | Вложения к сообщениям (локально в dev, S3/MinIO в prod) |
| **Аккаунты** | Регистрация, вход по паролю или коду на email (SMTP) |
| **Тарифы** | Free / Pro / Business с квотами ИИ-токенов и лимитом проектов |

---

## Типы нод (блоков схемы)

Сценарий бота — это граф из типизированных нод. Основные типы:

| Тип | Назначение |
|-----|------------|
| `trigger` | Точка входа: команда (`/start`), любое сообщение, неактивность пользователя (напоминание) |
| `message` | Текст бота, inline/reply-клавиатуры, HTML-разметка, задержки, вложения |
| `condition` | Ветвление: подписка на канал, Premium, username, параметр `/start` |
| `choice` | Выбор одного варианта из списка (услуга, мастер, время) с сохранением в переменную |
| `form` | Последовательный сбор нескольких полей (имя, телефон, email, контакт) |
| `wait_input` | Ожидание свободного текста или контакта от пользователя |
| `set_variable` | Запись переменной (литерал, шаблон или последнее сообщение) |
| `save_record` | Сохранение записи во встроенную коллекцию проекта (`leads`, `orders`, `appointments`…) |
| `admin_notify` | Уведомление в заданный чат (часто `{{secret.ADMIN_CHAT_ID}}`) |
| `http_request` | Запрос к внешнему API с ветками success/error и извлечением полей из JSON |
| `json_extract` | Извлечение значения из JSON-переменной (предпочтительнее `extractions` в `http_request`) |
| `ai_reply` | Ответ пользователю через ИИ по системному промпту |
| `jump` | Переход к другой ноде (кнопка «Назад в меню», циклы) |

Переменные в текстах: `{{nickname}}`, `{{first_name}}`, `{{var.имя}}`, `{{secret.KEY}}`.

---

## Примеры ботов

- **Запись и услуги** — барбершоп, салон, репетитор: выбор слота, форма контактов, запись в базу, уведомление менеджеру, напоминание при неактивности.
- **Магазин и заказы** — каталог с кнопками, корзина, сбор адреса, оплата по ссылке (ЮKassa).
- **Поддержка и FAQ** — меню разделов, ответы ИИ, эскалация сложных обращений админу.
- **Сбор заявок и лидов** — квизы, анкеты, сохранение в `save_record`, аналитика по воронке.
- **Гейт по подписке** — проверка членства в канале перед выдачей контента.
- **Рассылки и возврат** — триггер `inactivity` для напоминаний неактивным пользователям.

---

## Аналитика и данные

- **Обзор** — число пользователей, активные за день/неделю, популярные команды, ошибки за 7 дней.
- **События** — входящие/исходящие сообщения, callback-кнопки, исполнения нод.
- **ИИ-аналитик** — задайте вопрос на русском («Сколько активных за неделю?», «Какие команды популярны?») — агент построит запрос к данным проекта.
- **Записи** — данные из `save_record` доступны владельцу проекта; можно спрашивать ИИ о лидах и заказах.

---

## Тарифы платформы

| Тариф | Цена | Боты | ИИ-токены / месяц |
|-------|------|------|-------------------|
| **Free** | 0 ₽ | 1 | 150K |
| **Pro** | 990 ₽ | до 10 | 1.5M |
| **Business** | 2 990 ₽ | без лимита | 6M |

Оплата подписки — через ЮKassa (`YOOKASSA_*` в env). На этапе открытой беты доступ может быть бесплатным с лимитом мест (`MAX_BETA_USERS`).

---

## Безопасность

- Токен бота и секреты проекта шифруются (`SECRETS_ENC_KEY`).
- Сессии Auth.js (`AUTH_SECRET`), отдельный секрет для cron-эндпоинта.
- Webhook Telegram защищён секретом на проект.
- Сессии диалога бота и rate limiting — Redis (в dev допустим in-memory fallback).

---

## Статус

Проект в **открытой бете**: генерация и доработка схем через ИИ, полный рантайм ботов, аналитика, записи, платежи по ссылке. Запросы к ИИ могут вставать в очередь при пиковой нагрузке.

---

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
| Start | `pnpm start:all` (Next.js + bot-worker в одном контейнере) |

Если в Railway Dashboard задан свой **Build Command** со старым `db:migrate:deploy` — удалите его или оставьте только `pnpm build`, иначе UI перебьёт `railway.toml`.

**Сервисы в проекте:**

1. **Web** — это приложение (подключить репозиторий). `railway.toml` поднимает **и сайт, и bot-worker** (`pnpm start:all`).
2. **PostgreSQL** — `DATABASE_URL=${{Postgres.DATABASE_URL}}` (internal URL, не PUBLIC).
3. **Redis** — `REDIS_URL=${{Redis.REDIS_URL}}`.
4. **MinIO** (или любой S3) — медиа-вложения ботов. Локальный диск (`MEDIA_STORAGE_DRIVER=local`) на Railway эфемерен: файлы пропадут при редеплое.

Отдельный bot-worker сервис (`railway.worker.toml`) — опционально, если нужно масштабировать web и polling независимо.

**Пример переменных (web-сервис):**

```env
NODE_ENV=production
APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}

# Надёжнее webhook на Railway: polling (worker стартует вместе с web через start:all).
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
- `pnpm build` / `pnpm start` — продакшен-сборка и запуск Next.js.
- `pnpm start:all` — web + bot-worker (как на Railway).
- `pnpm start:worker` — только bot-worker.
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
