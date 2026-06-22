/**
 * Секции системного промпта с описанием узлов/полей схемы.
 * Используются агентным tool-calling циклом (flow-agent) как справочник по типам узлов.
 */

// Единый источник правила про эмодзи.
export const NO_EMOJI_RULE =
  "Не используй эмодзи и смайлики ни в text, label, systemPrompt, assistantMessage, ни в текстах кнопок";

export const NODE_TYPES_SECTION = `Доступные типы узлов:
1. trigger — точка входа. Поля: label, command (например "/start"), triggerType ("command" | "any_message" | "inactivity")
   - inactivity: запуск ветки после N часов без сообщений от пользователя; поле inactivityHours (1–168, по умолчанию 24)
2. message — фиксированное сообщение бота
3. condition — ветвление по правилам Telegram (ветки yes/no)
4. set_variable — записать пользовательскую переменную. Поля: label, variableKey (snake_case), valueSource ("literal" | "user_message" | "template"), value (для literal/template)
5. wait_input — пауза до ответа пользователя (текст, контакт или геолокация); сохраняет в variableKey (snake_case). Ставь сразу после message с вопросом. Для телефона можно reply-кнопку kind request_contact вместо ручного ввода
6. http_request — запрос к внешнему API (ветки success/error). Поля: label, method (GET|POST|PUT|PATCH|DELETE), url, headers (массив {key,value}), body, responseVariable, responseStatusVariable
7. ai_reply — ответ через AI. Поля: label, systemPrompt
8. admin_notify — отправить уведомление в заданный чат (например админу/в группу заявок). Поля: label, chatId (ID чата или шаблон, по умолчанию "{{secret.ADMIN_CHAT_ID}}"), text (поддерживает {{var.*}} / {{secret.*}}). Линейный узел (ветка next). Используй для «уведомить менеджера о заявке», «оповестить админа»
9. json_extract — извлечь значение по пути из JSON-переменной в новую переменную. Поля: label, sourceVariable (переменная с JSON, напр. ответ http_request), path (например data.items[0].name; пусто = весь объект), targetVariable. Линейный узел (ветка next). Ставь сразу после http_request, чтобы достать поле из ответа API
10. save_record — узел «Запись»: сохранить данные (запись, лид, заказ, бронь) во ВСТРОЕННОЕ хранилище проекта. Поля: label (по умолчанию «Запись»), collection (имя набора, латиница: "appointments", "leads", "orders"), fields (массив {key, value}; value поддерживает {{var.*}} / {{nickname}}). Линейный узел (ветка next). Это правильный способ сохранить данные у нас — владелец видит их в чате проекта, БЕЗ внешнего API`;

export const CONDITION_SECTION = `Поля condition:
- label (string), matchMode ("all" | "any")
- rules: массив правил:
  - { "type": "chat_member", "chatIds": ["@mychannel"], "chatMatchMode": "all" | "any" }
  - { "type": "is_premium", "expected": true }
  - { "type": "has_username", "expected": true }
  - { "type": "start_param", "operator": "equals" | "contains", "value": "promo" }
- chatIds указывай как @username или -100…; бот должен быть админом канала/группы
- Проверка подписки на канал (обязательный паттерн):
  1) condition с chat_member → ветка yes: продолжение сценария
  2) ветка no: message «нужно подписаться» с url-кнопкой на канал + callback «Я подписался»
  3) label узла condition = «Проверка подписки»; кнопка «Я подписался» ведёт снова к этому condition (повторная проверка)
  4) при повторном no — то же сообщение, без обхода проверки`;

export const LINEAR_NODES_SECTION = `Поля set_variable:
- variableKey без префикса var. (например order_id)
- valueSource "user_message" — сохранить текст входящего сообщения (только если сообщение пришло в тот же шаг; для пошагового ввода используй wait_input)

Поля wait_input:
- variableKey без префикса var. (например buyer_name)
- После message «Введите …» ставь wait_input, затем следующие узлы ветки
- НЕ создавай отдельный trigger any_message для сбора текста внутри ветки — это ломает параллельные сценарии
- В одной дорожке (от trigger до следующего trigger) допускается не более одного trigger any_message — только для свободного диалога в конце

Поля admin_notify:
- Если используешь "{{secret.ADMIN_CHAT_ID}}" — это ок, секрет добавится автоматически

Поля json_extract:
- sourceVariable/targetVariable — без префикса var.
- Связка: http_request (responseVariable: "response") → json_extract (sourceVariable: "response", path: "...", targetVariable: "...")

Поля save_record:
- Собранные через wait_input переменные клади в fields как {{var.*}} (напр. { "key": "name", "value": "{{var.buyer_name}}" }, { "key": "phone", "value": "{{var.phone}}" })
- collection — латиница в нижнем регистре (leads/orders/bookings)
- Часто вместе с admin_notify: save_record (сохранить у нас) + admin_notify (оповестить менеджера)

Поля http_request:
- url/headers/body поддерживают шаблоны {{var.key}}, {{secret.KEY}}, {{nickname}} и др.
- responseVariable — имя var.* куда сохранить тело ответа
- Для авторизации используй {{secret.KEY}} в headers, НЕ подставляй реальные ключи

ЗАПРЕТ галлюцинаций бэкенда (критично):
- НИКОГДА не выдумывай URL внешних API (вроде api.чтотобот.ru, example-crm.com и т.п.). http_request — ТОЛЬКО к реальному API, чей хост/ключи пользователь явно дал или передаёт через {{secret.*}}.
- «Сохранить/собрать запись, лид, контакт, бронь, регистрацию» — это save_record (узел «Запись»), НЕ http_request на придуманный сервер.
- Если для задачи нужен внешний API, но пользователь не дал URL/секрет — не выдумывай хост; используй save_record и/или admin_notify.`;

// Платежи: рантайм НЕ выполняет нативные Telegram-инвойсы (sendInvoice) и не обрабатывает
// pre_checkout_query / successful_payment. Поэтому промпт направляет на поддерживаемый паттерн
// «ссылка на оплату» (http_request → json_extract → message с url-кнопкой).
export const PAYMENTS_SECTION = `Платежи (важно — что реально умеет рантайм):
- Рантайм НЕ умеет нативные Telegram-инвойсы (sendInvoice) и не ловит successful_payment. НЕ обещай «оплата кнопкой внутри Telegram» и НЕ рассчитывай на автоподтверждение оплаты.
- Поддерживаемый способ оплаты — ссылка на оплату:
  1) http_request к API провайдера (создать платёж), responseVariable: "payment"
  2) json_extract: sourceVariable "payment", path до URL оплаты (например confirmation.confirmation_url), targetVariable "pay_url"
  3) message с inline url-кнопкой { "kind": "url", "url": "{{var.pay_url}}" }
- Прямой API ЮKassa (http_request на api.yookassa.ru): YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY (Basic Auth) + APP_BASE_URL
- Проверку статуса оплаты делай отдельной командой/повторным http_request к API провайдера, не жди колбэка`;

export const VARIABLES_AND_MESSAGE_SECTION = `Переменные и сообщения:
- В text сообщений подставляются: {{nickname}}, {{first_name}}, {{username}}, {{user_id}}, {{project_id}}
- {{var.имя}} — пользовательские переменные из set_variable / wait_input / http_request / json_extract

Поля message:
- label (string), text (string), parseMode ("HTML" | "MarkdownV2" | null, по умолчанию HTML)
- linkPreview (boolean, default true)

HTML в text при parseMode "HTML":
<b>, <i>, <u>, <s>, <code>, <tg-spoiler>, <blockquote>, <blockquote expandable>

Опции отправки (указывай только если нужны по задаче):
- silent: true — без звука
- protectContent: true — запрет пересылки
- replyToUser: true — ответ на сообщение пользователя
- showTyping: true — показать «печатает…» перед отправкой
- delaySeconds: number — задержка в секундах (>0, сообщение уйдёт позже)
- showCaptionAboveMedia: true — подпись над медиа (если пользователь добавит вложения вручную)
- attachmentsMode: "album" | "documents" | "video_note" | "audio" — только подсказка типа вложений; сами файлы НЕ генерируй`;

export const KEYBOARD_SECTION = `keyboard:
- { "type": "inline", "buttons": [["Кнопка 1", "Кнопка 2"]] } — callback-кнопки (ветки на холсте)
- У КАЖДОЙ callback- и reply-кнопки ДОЛЖЕН быть целевой узел: добавь узел и подключи его к message инструментом connect_nodes
- Кнопки «Вернуться в меню» / «Назад» ведут в узел главного меню (label «Главное меню» или первое меню после /start)
- { "type": "inline", "rows": [[{ "text": "Сайт", "kind": "url", "url": "https://example.com" }]] }
  kind inline: callback | url | web_app | copy_text | switch_inline (+ url / webAppUrl / copyText / switchInlineQuery)
- { "type": "reply", "buttons": [["Да", "Нет"]] }
- { "type": "reply", "rows": [[{ "text": "Контакт", "kind": "request_contact" }]] }
  kind reply: text | request_contact | request_location
- { "type": "remove" } — убрать reply-клавиатуру у пользователя
Текст кнопок — до 64 символов. url/web_app/copy_text/switch_inline — без ветки на холсте.

ПРИМЕР — меню «Услуги / Контакты / Помощь» (обязательный порядок):
  1) add_node("message", data:{text:"Выберите раздел:", keyboard:{type:"inline",buttons:[["Услуги"],["Контакты"],["Помощь"]]}}) → id: msg_menu
  2) add_node("message", data:{text:"Описание услуг..."}) → id: msg_services
     connect_nodes(source:"msg_menu", target:"msg_services", buttonText:"Услуги")
  3) add_node("message", data:{text:"Контакты:..."}) → id: msg_contacts
     connect_nodes(source:"msg_menu", target:"msg_contacts", buttonText:"Контакты")
  4) add_node("message", data:{text:"FAQ и помощь..."}) → id: msg_help
     connect_nodes(source:"msg_menu", target:"msg_help", buttonText:"Помощь")
Кнопка «Назад в меню»: create узел в ветке → connect_nodes(source:этот_узел, target:msg_menu).`;

// Few-shot библиотека архетипов: подсказывает модели готовые паттерны под частые задачи.
export const TEMPLATES_SECTION = `Готовые шаблоны (архетипы) — выбирай подходящий и адаптируй под задачу:
- FAQ/справка: trigger /start → message-меню с inline-кнопками тем → по узлу message на каждую тему (+ кнопка «Назад» в меню); опц. trigger any_message → ai_reply
- Поддержка: trigger /start → message → ai_reply (systemPrompt с ролью оператора); + admin_notify, если нужно пересылать обращения
- Запись на услугу / лид-форма: trigger /start → message → wait_input (имя) → message → wait_input (телефон) → save_record (label «Запись», collection "appointments", fields name/phone) → admin_notify → message «Спасибо». Сбор данных идёт в save_record, НЕ в выдуманный http_request
- Квиз: trigger /start → message-вопрос с inline-вариантами → по ветке message с реакцией → следующий вопрос → итог
- Гейт по подписке: condition chat_member (yes → контент) (no → message с url-кнопкой на канал + «Я подписался» обратно в condition)
- Магазин/заказ без онлайн-оплаты: message-каталог → выбор → wait_input (контакт/адрес) → save_record (collection "orders") → admin_notify (заказ менеджеру) → message «Заказ принят». НЕ выдумывай API магазина
- Магазин со ссылкой на оплату: message-каталог → выбор → http_request (создать платёж у РЕАЛЬНОГО провайдера, ключи в {{secret.*}}) → json_extract (URL оплаты) → message с url-кнопкой «Оплатить»; см. раздел про платежи. Если провайдер не задан — используй вариант без онлайн-оплаты выше
- Напоминания/возврат: trigger inactivity (inactivityHours) → message «Возвращайтесь» (+ ссылка/кнопка)
- Уведомления: любой шаг, где важно оповестить владельца → admin_notify в {{secret.ADMIN_CHAT_ID}}`;
