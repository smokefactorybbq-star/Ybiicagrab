# MealPoint — сайт подписки на горячие обеды

**Текущее полное обновление:** [FULL_UPDATE_RU.md](FULL_UPDATE_RU.md). Цены 350 ฿, скидки по датам, управление пунктами и картой, добавление дней и QR с QR_SIGNING_SECRET. Эта инструкция имеет приоритет над историческими описаниями ниже.

**Последнее исправление QR:** [QR_FIX_RU.md](QR_FIX_RU.md). Подпись через QR_SIGNING_SECRET, видимые QR в кабинете менеджера, скачивание и печать. Эти указания имеют приоритет над прежними инструкциями QR.

**Актуальное обновление от 19.09.2026:** начните с [UPDATE_RU.md](UPDATE_RU.md). Там описаны запуск, новые оплаты, курс 2,75, QR и очистка подписок с обязательной резервной копией. Результаты проверки — [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Ниже сохранены исторические сведения о проекте; при расхождениях используйте UPDATE_RU.md.

Это один Next.js-проект MealPoint. В проекте есть клиентский кабинет, менеджер, кухня, курьер, самовывоз по QR и подписки.

## Что изменено в v0.9.0

- Вход/регистрация клиента снова через Telegram, без SMS-кода.
- Телефон после Telegram-входа вводится клиентом в профиле и используется только как контактный номер.
- QR-коды всех точек самовывоза снова доступны менеджеру. Поддерживаются обе переменные секрета: `PICKUP_QR_SECRET` и старая `QR_SIGNING_SECRET`.
- Восстановлен постоянный чат клиент ↔ менеджер с историей и счётчиком непрочитанных сообщений.
- Ответ менеджера сохраняется в чате и, если Telegram разрешает боту писать пользователю, дополнительно отправляется клиенту в Telegram.
- В блоке «Клиенты на день → Самовывоз» менеджер может вручную списать обед, если он был доставлен на точку, но клиент его не забрал. Повторное списание защищено транзакцией.

## Telegram-вход

Клиентский кабинет использует Telegram OpenID Connect. После выхода MealPoint полностью удаляет свою серверную сессию. При следующем входе пользователь заново вводит номер телефона, а Telegram возвращает подтверждённый номер; сайт сверяет их перед созданием новой сессии. В запрос авторизации добавляется `prompt=login`, поэтому предыдущая Telegram Web-авторизация не должна использоваться как тихий вход.

Обязательно:

- `TELEGRAM_BOT_TOKEN` — остаётся нужен для Bot API и уведомлений.
- `TELEGRAM_CLIENT_ID` — Client ID из @BotFather → Bot Settings → Web Login. Если не задан, сервер пробует использовать numeric bot id из `TELEGRAM_BOT_TOKEN`, но явная переменная предпочтительнее.
- `TELEGRAM_CLIENT_SECRET` — Client Secret из того же раздела Web Login. Это НЕ bot token.
- `MEALPOINT_PUBLIC_URL=https://www.meal-point.com`.
- В @BotFather → Web Login → Allowed URLs добавить `https://www.meal-point.com` и `https://www.meal-point.com/api/auth/telegram/oidc-callback`.
- Для подписи ID token оставьте стандартный алгоритм `RS256`.

Legacy `/api/auth/telegram/callback` сохранён только для совместимости, но текущий клиентский интерфейс его не использует. Старые SMS API-маршруты отключены.

## QR самовывоза

Нужен секрет длиной не менее 24 символов. Достаточно одной из переменных:

- `PICKUP_QR_SECRET` — основное новое имя;
- `QR_SIGNING_SECRET` — старое имя, поддерживается для существующего Railway deployment;
- `SUBSCRIPTION_QR_SECRET` — дополнительный fallback для совместимости.

QR менеджер открывает на `/manager` в блоке «QR точек выдачи». Коды точек хранятся в одном источнике `data/pickupPoints.ts`, поэтому список точек и QR больше не расходятся.

## Чат

Чаты сохраняются в PostgreSQL:

- `customer_conversations`
- `customer_messages`

Клиент открывает чат кнопкой 💬 в `/account`. Менеджер открывает чат кнопкой «Чат» напротив подписки в `/manager`. Непрочитанные сообщения показываются красным счётчиком.

## Ручное списание самовывоза

В `/manager` → «Клиенты на день» → «Самовывоз» у необработанного клиента есть кнопка «Списать». После подтверждения:

1. день подписки получает статус `MISSED`;
2. ставятся `consumed_at` и поля аудита `manual_writeoff_*`;
3. `remaining_portions` уменьшается ровно на 1;
4. повторный QR или повторное ручное списание этого дня блокируется;
5. действие записывается в `manager_events` как `PICKUP_MANUAL_WRITEOFF`.

## Основные страницы

- `/` — выбор подписки.
- `/account` — Telegram-вход, профиль, оплата, подписки, QR-сканер и чат.
- `/manager` — подписки, самовывоз, QR точек, ручное списание и чаты.
- `/kitchen` — экран кухни.
- `/courier` — экран курьера.

## Railway

При старте `scripts/db-init.mjs` применяет `database/schema.sql`; новые таблицы/колонки создаются через `IF NOT EXISTS`, существующие пользователи и подписки не удаляются.

Минимально проверьте Variables:

```text
DATABASE_URL=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=your_bot_username
TELEGRAM_CLIENT_ID=...
TELEGRAM_CLIENT_SECRET=...
MEALPOINT_PUBLIC_URL=https://www.meal-point.com
MANAGER_USERNAME=manager
MANAGER_PASSWORD=...
PICKUP_QR_SECRET=long-random-secret-at-least-24-chars
MANAGER_TELEGRAM_CHAT_ID=...   # необязательно, для уведомлений; старый ADMIN_CHAT_ID тоже работает
```

## Telegram Login domain — v0.9.1

Production login is pinned to `https://www.meal-point.com`. The Telegram bot username is resolved from `TELEGRAM_BOT_TOKEN` first, so a stale `TELEGRAM_BOT_USERNAME` cannot silently select another bot. Set `MEALPOINT_PUBLIC_URL=https://www.meal-point.com` in Railway (optional because this is the default). In BotFather configure the same bot linked to the token: legacy `/setdomain` = `www.meal-point.com`; in Login Widget / Allowed URLs also add `https://www.meal-point.com` and `https://www.meal-point.com/api/auth/telegram/callback`.
