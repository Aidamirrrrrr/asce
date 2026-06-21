import type { BotFlowDocument, FlowNode, FlowSecretDeclaration } from "@/lib/flow/flow-schema";
import { extractSecretKeysFromFlow } from "@/lib/flow/template-vars";

export type SecretRecipeEntry = {
  key: string;
  label: string;
  description: string;
  howToGet: string;
  userLabel?: string;
  userDescription?: string;
  userHowToGet?: string;
};

type SecretRecipe = {
  id: string;
  detect: RegExp;
  exclude?: RegExp;
  secrets: SecretRecipeEntry[];
  setupNotes?: string[];
  userSetupNotes?: string[];
};

// Рантайм не выполняет нативные Telegram-инвойсы (sendInvoice) и не ловит successful_payment.
// Эти заметки честно сообщают об ограничении и направляют на рабочий паттерн «ссылка на оплату».
const PAYMENTS_RUNTIME_NOTE =
  "Рантайм НЕ выполняет нативные Telegram-инвойсы (sendInvoice) и не обрабатывает successful_payment. Оплату делай через ссылку: http_request к API провайдера → json_extract URL оплаты → message с url-кнопкой.";
const PAYMENTS_RUNTIME_USER_NOTE =
  "Оплата сейчас работает через ссылку на платёжную страницу провайдера (не кнопкой-инвойсом внутри Telegram). Бот отправит покупателю ссылку «Оплатить».";

const YOOKASSA_SHOP_ID: SecretRecipeEntry = {
  key: "YOOKASSA_SHOP_ID",
  label: "Shop ID ЮKassa",
  description: "Идентификатор магазина для HTTP Basic Auth в API ЮKassa",
  howToGet: "ЮKassa → Настройки → shopId (числовой ID магазина)",
  userLabel: "Shop ID ЮKassa",
  userDescription: "Нужен только при прямой интеграции с API ЮKassa (не для оплаты через Telegram)",
  userHowToGet: "Личный кабинет ЮKassa → Настройки → идентификатор магазина",
};

const YOOKASSA_SECRET_KEY: SecretRecipeEntry = {
  key: "YOOKASSA_SECRET_KEY",
  label: "Секретный ключ ЮKassa",
  description: "Секретный ключ API (test_… или live_…) для запросов к api.yookassa.ru",
  howToGet: "ЮKassa → Интеграция → Ключи API → выпустите секретный ключ",
  userLabel: "Секретный ключ ЮKassa",
  userDescription: "Нужен только при прямой интеграции с API ЮKassa (не для оплаты через Telegram)",
  userHowToGet: "Личный кабинет ЮKassa → Интеграция → Ключи API",
};

const APP_BASE_URL: SecretRecipeEntry = {
  key: "APP_BASE_URL",
  label: "Публичный адрес приложения",
  description:
    "Корень API этого сервиса (APP_URL на сервере). Сюда приходят webhook Telegram, проверка билетов и HTTP-уведомления кассы",
  howToGet: "URL развёрнутого конструктора ботов — та же переменная APP_URL на сервере",
  userLabel: "Адрес этого приложения",
  userDescription:
    "Публичный URL вашего развёрнутого конструктора — на него приходят колбэки Telegram и кассы",
  userHowToGet: "Скопируйте APP_URL с сервера, например https://bots.ваш-домен.ru",
};

const VERIFY_BASE_URL: SecretRecipeEntry = {
  key: "VERIFY_BASE_URL",
  label: "API проверки билетов",
  description:
    "Базовый URL эндпоинта проверки билета в этом приложении (для QR: VERIFY_BASE_URL/order_id)",
  howToGet: "{APP_BASE_URL}/api/projects/{project_id}/tickets/verify",
  userLabel: "Проверка билетов (наше API)",
  userDescription:
    "Ссылка в QR ведёт на API этого приложения — сюда приходит проверка билета на входе",
  userHowToGet:
    "Подставьте адрес приложения: https://ваш-домен/api/projects/ID_ПРОЕКТА/tickets/verify (ID виден в URL редактора)",
};

/**
 * Порядок важен: более специфичные рецепты — выше.
 * Источники: core.telegram.org/bots/payments, yookassa.ru/docs (Telegram + API keys).
 */
const SECRET_RECIPES: SecretRecipe[] = [
  {
    id: "yookassa_api",
    detect: /api\.?yookassa\.ru|yookassa\.ru\/v3/i,
    secrets: [YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, APP_BASE_URL],
    setupNotes: [
      "Для API ЮKassa: Authorization Basic base64(shopId:secretKey), заголовок Idempotence-Key на каждый платёж",
      "HTTP-уведомления ЮKassa (ЛК → Интеграция → HTTP-уведомления): {{secret.APP_BASE_URL}}/api/payments/yookassa/webhook/{project_id}",
      "В metadata платежа передайте chat_id и user_id — webhook продолжит сценарий (триггер payment_succeeded или активный wait_input)",
    ],
    userSetupNotes: [
      "Эти ключи нужны только при прямой интеграции с API ЮKassa. Для оплаты кнопкой в Telegram достаточно токена из @BotFather.",
      "В личном кабинете ЮKassa укажите URL HTTP-уведомлений на API этого приложения (см. подсказку к APP_BASE_URL).",
    ],
  },
  {
    id: "yookassa_telegram",
    detect: /ю\s*kassa|юкасса|yoo\s*kassa/i,
    exclude: /api\.?yookassa\.ru|yookassa\.ru\/v3/i,
    secrets: [YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, APP_BASE_URL],
    setupNotes: [
      PAYMENTS_RUNTIME_NOTE,
      "Рабочий способ: http_request к API ЮKassa (Basic Auth shopId:secretKey) создаёт платёж → ссылка confirmation.confirmation_url в url-кнопку",
      "HTTP-уведомления ЮKassa (ЛК → Интеграция → HTTP-уведомления): {{secret.APP_BASE_URL}}/api/payments/yookassa/webhook/{project_id}",
      "В metadata платежа передайте chat_id и user_id — webhook продолжит сценарий (триггер payment_succeeded или активный wait_input)",
    ],
    userSetupNotes: [
      PAYMENTS_RUNTIME_USER_NOTE,
      "Для приёма оплаты понадобятся Shop ID и секретный ключ из личного кабинета ЮKassa.",
    ],
  },
  {
    id: "robokassa_telegram",
    detect: /robokassa|робокасса/i,
    secrets: [APP_BASE_URL],
    setupNotes: [
      PAYMENTS_RUNTIME_NOTE,
      "Рабочий способ: сформируй ссылку оплаты Robokassa (http_request/шаблон URL) и отдай её url-кнопкой",
    ],
    userSetupNotes: [PAYMENTS_RUNTIME_USER_NOTE],
  },
  {
    id: "stripe_api",
    detect: /\bstripe\b/i,
    secrets: [
      {
        key: "STRIPE_SECRET_KEY",
        label: "Secret key Stripe",
        description:
          "Секретный ключ Stripe для серверных запросов (Checkout Session / PaymentLink)",
        howToGet: "Stripe Dashboard → Developers → API keys → Secret key",
      },
    ],
    setupNotes: [
      PAYMENTS_RUNTIME_NOTE,
      "Рабочий способ: http_request к Stripe (Checkout Session / Payment Link) → url-кнопка со ссылкой оплаты",
    ],
    userSetupNotes: [PAYMENTS_RUNTIME_USER_NOTE],
  },
  {
    id: "payments_generic",
    detect:
      /telegram\s*payments|sendinvoice|provider_token|оплат|платёж|платеж|invoice|эквайринг|telegram\s*stars|звёзд|xtr/i,
    secrets: [],
    setupNotes: [
      PAYMENTS_RUNTIME_NOTE,
      "Рабочий способ: http_request к API провайдера создаёт платёж → json_extract достаёт URL оплаты → message с url-кнопкой «Оплатить»",
    ],
    userSetupNotes: [PAYMENTS_RUNTIME_USER_NOTE],
  },
  {
    id: "admin_notify",
    detect: /уведом.*админ|admin.*chat|администратор/i,
    secrets: [
      {
        key: "ADMIN_CHAT_ID",
        label: "Chat ID администратора",
        description: "Куда слать уведомления о заказах и оплатах",
        howToGet:
          "личный чат — @userinfobot; группа — добавьте бота и посмотрите chat.id в getUpdates",
        userLabel: "Ваш Telegram для уведомлений",
        userDescription: "Куда бот будет присылать сообщения о новых оплатах",
        userHowToGet:
          "Напишите боту @userinfobot — он пришлёт ваш ID. Для группы добавьте бота в чат.",
      },
    ],
  },
  {
    id: "verify_url",
    detect:
      /verify_base_url|app_base_url|верификац.*билет|проверк.*билет|уникальн.*ссылк.*билет|qr.*билет|билет.*qr/i,
    secrets: [APP_BASE_URL, VERIFY_BASE_URL],
    setupNotes: [
      "QR-ссылка билета: {{secret.VERIFY_BASE_URL}}/{{var.order_id}} — только API этого приложения, не сторонние домены",
      "VERIFY_BASE_URL = {APP_BASE_URL}/api/projects/{project_id}/tickets/verify; project_id доступен в шаблонах как {{project_id}}",
    ],
    userSetupNotes: [
      "В QR-коде — ссылка на API этого приложения, не на сторонний сайт. Адрес подставляется из APP_URL сервера.",
    ],
  },
  {
    id: "external_api",
    detect: /http_request|внешн.*api|webhook.*crm|интеграц.*api/i,
    exclude: /qrserver\.com|api\.qrserver/i,
    secrets: [
      {
        key: "EXTERNAL_API_KEY",
        label: "API-ключ внешнего сервиса",
        description: "Bearer или API key для http_request",
        howToGet: "личный кабинет подключаемого сервиса → раздел API / интеграции",
        userLabel: "Ключ внешнего сервиса",
        userDescription: "Если бот подключается к стороннему сервису по API",
        userHowToGet: "В личном кабинете сервиса → раздел API или интеграции",
      },
    ],
  },
];

export type InferredSecretsResult = {
  secrets: SecretRecipeEntry[];
  setupNotes: string[];
  userSetupNotes: string[];
};

export function inferSecretRecipesFromText(
  ...parts: Array<string | null | undefined>
): SecretRecipeEntry[] {
  return collectSecretRecipes(...parts).secrets;
}

export function collectSecretRecipes(
  ...parts: Array<string | null | undefined>
): InferredSecretsResult {
  const combined = parts.filter(Boolean).join("\n");
  if (!combined.trim()) {
    return { secrets: [], setupNotes: [], userSetupNotes: [] };
  }

  const secretsByKey = new Map<string, SecretRecipeEntry>();
  const setupNotes = new Set<string>();
  const userSetupNotes = new Set<string>();

  for (const recipe of SECRET_RECIPES) {
    if (!recipe.detect.test(combined)) {
      continue;
    }

    if (recipe.exclude?.test(combined)) {
      continue;
    }

    for (const secret of recipe.secrets) {
      if (!secretsByKey.has(secret.key)) {
        secretsByKey.set(secret.key, secret);
      }
    }

    for (const note of recipe.setupNotes ?? []) {
      setupNotes.add(note);
    }

    for (const note of recipe.userSetupNotes ?? []) {
      userSetupNotes.add(note);
    }
  }

  return {
    secrets: [...secretsByKey.values()],
    setupNotes: [...setupNotes],
    userSetupNotes: [...userSetupNotes],
  };
}

export function enrichFlowSecretDeclarations(
  existing: FlowSecretDeclaration[] | undefined,
  inferred: SecretRecipeEntry[],
): FlowSecretDeclaration[] {
  const byKey = new Map((existing ?? []).map((secret) => [secret.key, secret]));

  for (const entry of inferred) {
    if (!byKey.has(entry.key)) {
      byKey.set(entry.key, {
        key: entry.key,
        label: entry.label,
        description: entry.description,
      });
    }
  }

  return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function findSecretRecipeEntryByKey(key: string): SecretRecipeEntry | undefined {
  for (const recipe of SECRET_RECIPES) {
    const entry = recipe.secrets.find((item) => item.key === key);
    if (entry) {
      return entry;
    }
  }

  return undefined;
}

function fallbackSecretEntry(key: string): SecretRecipeEntry {
  return {
    key,
    label: key,
    description: "Используется в сценарии",
    howToGet: "Укажите значение в настройках проекта → Секреты",
  };
}

/** Собрать секреты из узлов: рецепты, {{secret.KEY}} в полях, типы узлов (admin_notify → ADMIN_CHAT_ID). */
export function inferSecretRecipeEntriesFromFlow(
  flow: Pick<BotFlowDocument, "nodes">,
  ...contextParts: Array<string | null | undefined>
): SecretRecipeEntry[] {
  const nodeText = JSON.stringify(flow.nodes ?? []);
  const byKey = new Map<string, SecretRecipeEntry>();

  for (const entry of inferSecretRecipesFromText(...contextParts, nodeText)) {
    byKey.set(entry.key, entry);
  }

  for (const key of extractSecretKeysFromFlow(nodeText)) {
    if (!byKey.has(key)) {
      byKey.set(key, findSecretRecipeEntryByKey(key) ?? fallbackSecretEntry(key));
    }
  }

  if ((flow.nodes ?? []).some((node) => node.type === "admin_notify")) {
    const adminChat = findSecretRecipeEntryByKey("ADMIN_CHAT_ID");
    if (adminChat) {
      byKey.set(adminChat.key, adminChat);
    }
  }

  return [...byKey.values()];
}

/** Дополнить flow.secrets по содержимому узлов (редактор, сохранение, генерация). */
export function applyInferredSecretsToFlow(
  doc: BotFlowDocument,
  ...contextParts: Array<string | null | undefined>
): BotFlowDocument {
  const inferred = inferSecretRecipeEntriesFromFlow(doc, ...contextParts);
  if (inferred.length === 0) {
    return doc;
  }

  const secrets = enrichFlowSecretDeclarations(doc.secrets, inferred);
  const unchanged =
    secrets.length === (doc.secrets?.length ?? 0) &&
    secrets.every((secret, index) => secret.key === doc.secrets?.[index]?.key);

  return unchanged ? doc : { ...doc, secrets };
}

export function enrichFlowWithInferredSecrets(
  flow: { secrets?: FlowSecretDeclaration[]; nodes?: unknown[] },
  ...contextParts: Array<string | null | undefined>
): FlowSecretDeclaration[] {
  const doc = applyInferredSecretsToFlow(
    {
      nodes: (flow.nodes ?? []) as FlowNode[],
      edges: [],
      secrets: flow.secrets,
    },
    ...contextParts,
  );

  return doc.secrets ?? [];
}

function formatUserFacingSecret(entry: SecretRecipeEntry): {
  label: string;
  description: string;
  howToGet: string;
} {
  return {
    label: entry.userLabel ?? entry.label,
    description: entry.userDescription ?? entry.description,
    howToGet: entry.userHowToGet ?? entry.howToGet,
  };
}

export type UserSecretChecklistItem = {
  key: string;
  label: string;
  description: string;
  howToGet: string;
};

export function buildUserSecretsChecklist(
  flow: { secrets?: FlowSecretDeclaration[]; nodes?: unknown[] },
  ...contextParts: Array<string | null | undefined>
): { items: UserSecretChecklistItem[]; notes: string[] } {
  const nodeText = JSON.stringify(flow.nodes ?? []);
  const collected = collectSecretRecipes(...contextParts, nodeText);
  const itemsByKey = new Map<string, UserSecretChecklistItem>();

  for (const entry of collected.secrets) {
    const user = formatUserFacingSecret(entry);
    itemsByKey.set(entry.key, { key: entry.key, ...user });
  }

  for (const decl of flow.secrets ?? []) {
    if (!itemsByKey.has(decl.key)) {
      itemsByKey.set(decl.key, {
        key: decl.key,
        label: decl.label ?? decl.key,
        description: decl.description ?? "Нужен для работы сценария",
        howToGet: "Подготовьте значение заранее",
      });
    }
  }

  return {
    items: [...itemsByKey.values()].sort((left, right) => left.label.localeCompare(right.label)),
    notes: collected.userSetupNotes,
  };
}

function formatSecretsPlanSection(
  result: InferredSecretsResult,
  audience: "user" | "implementer",
): string {
  if (audience === "user") {
    const lines = [
      "## Что настроить после запуска",
      "",
      "Когда бот будет готов, откройте **Настройки проекта → Секреты** и укажите:",
      "",
    ];

    for (const entry of result.secrets) {
      const user = formatUserFacingSecret(entry);
      lines.push(`- **${user.label}** — ${user.description}`);
      lines.push(`  - Где взять: ${user.howToGet}`);
    }

    if (result.userSetupNotes.length > 0) {
      lines.push("", "**На заметку:**");
      for (const note of result.userSetupNotes) {
        lines.push(`- ${note}`);
      }
    }

    return lines.join("\n");
  }

  const lines = [
    "## Настройка после запуска",
    "",
    "Укажите в **Настройки проекта → Секреты** (в сценарии: `{{secret.KEY}}`):",
    "",
  ];

  for (const entry of result.secrets) {
    lines.push(`- **${entry.label}** (\`${entry.key}\`) — ${entry.description}`);
    lines.push(`  - Как получить: ${entry.howToGet}`);
  }

  if (result.setupNotes.length > 0) {
    lines.push("", "**Важно при настройке:**");
    for (const note of result.setupNotes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}

const SECRETS_SECTION_HEADING =
  /##\s*(Настройка после запуска|Что настроить после запуска|Секреты и переменные)/i;

export function ensureSecretsSectionInPlan(
  planText: string,
  contextParts: Array<string | null | undefined> = [],
  options: { audience?: "user" | "implementer" } = {},
): string {
  const audience = options.audience ?? "user";
  const collected = collectSecretRecipes(planText, ...contextParts);
  const missingSecrets = collected.secrets.filter((entry) => !planText.includes(entry.key));
  const notesSource = audience === "user" ? collected.userSetupNotes : collected.setupNotes;
  const missingNotes = notesSource.filter((note) => !planText.includes(note.slice(0, 24)));

  if (missingSecrets.length === 0 && missingNotes.length === 0) {
    return planText;
  }

  if (SECRETS_SECTION_HEADING.test(planText) && missingSecrets.length > 0 && audience === "user") {
    const extraLines = missingSecrets.flatMap((entry) => {
      const user = formatUserFacingSecret(entry);
      return [`- **${user.label}** — ${user.description}`, `  - Где взять: ${user.howToGet}`];
    });

    return `${planText.trim()}\n\n${extraLines.join("\n")}`;
  }

  return `${planText.trim()}\n\n${formatSecretsPlanSection(
    {
      secrets: missingSecrets,
      setupNotes: audience === "implementer" ? missingNotes : [],
      userSetupNotes: audience === "user" ? missingNotes : [],
    },
    audience,
  )}`;
}

export function formatMissingSecretsWarning(
  flow: { secrets?: FlowSecretDeclaration[]; nodes?: unknown[] },
  ...contextParts: Array<string | null | undefined>
): string | null {
  const inferred = inferSecretRecipesFromText(...contextParts, JSON.stringify(flow.nodes ?? []));
  const declared = new Set((flow.secrets ?? []).map((secret) => secret.key));
  const missing = inferred.filter((entry) => !declared.has(entry.key));

  if (missing.length === 0) {
    return null;
  }

  const keys = missing.map((entry) => entry.key).join(", ");
  return `⚠️ Для оплаты/интеграции не хватает секретов в сценарии: ${keys}. Они будут добавлены автоматически при сохранении.`;
}
