# MealPoint / Smoke Factory BBQ — security hardening

Этот вариант закрывает 8 блокирующих проблем, найденных при аудите.

## Что изменено

1. **Старые долговременные `?u=...&s=...` ссылки удалены из авторизации.**
   Website и Mini App больше не принимают Telegram ID из URL как способ входа. В Telegram используется только проверяемый `Telegram.WebApp.initData`. Старые параметры, если они случайно остались в ссылке, игнорируются/удаляются.

2. **Вход через Telegram на обычном сайте защищён одноразовым `state`.**
   Перед показом Telegram Login Widget сайт получает `/api/auth/telegram/state`, записывает одноразовый state в Secure HttpOnly cookie, а callback принимает вход только при совпадении state. Telegram login data и Mini App initData принимаются не старше 10 минут.

3. **Manager / Kitchen / Courier переведены на серверные staff sessions.**
   Пароли больше не лежат в `sessionStorage` и не отправляются в каждом API-запросе. После логина сервер выдаёт случайную Secure + HttpOnly + SameSite=Strict cookie на 12 часов. Логин ограничен 5 попытками за 10 минут.

4. **Старый Mini App больше не публикует корень проекта.**
   Express раздаёт только `public/`. `server.js`, `package.json` и остальные серверные файлы остаются вне web-root.

5. **Гостевой checkout имеет rate limit.**
   Для гостя: до 5 заказов на IP за 10 минут и до 4 заказов на телефон за 30 минут. Для авторизованного клиента лимит выше. Ограничения хранятся в PostgreSQL и работают между репликами приложения.

6. **Цена доставки рассчитывается только сервером.**
   Браузер отправляет код района (`BANG_TAO`, `RAWAI` и т.д.), сервер берёт стоимость из `lib/delivery.ts`. Переданная клиентом сумма `delivery` не используется для расчёта заказа.

7. **Пользовательские данные больше не вставляются через `innerHTML`.**
   Имя, телефон, адрес и история заказов выводятся через `textContent`, `createElement` и безопасные DOM-операции. Оставшиеся `innerHTML` используются только для статической разметки меню/интерфейса.

8. **Bot -> Check program защищён отдельным `RECEIPT_SECRET`.**
   Bot всегда отправляет `X-Receipt-Secret`. Для Windows добавлен `receipt-security-proxy/secure_receipt_proxy.py`: Cloudflare Tunnel должен смотреть на `127.0.0.1:8002`, а реальная чековая программа остаётся только на `127.0.0.1:8000`.

## Новые/обязательные Variables для Website

```text
DATABASE_URL=<ОСНОВНАЯ БД Mini App + Website>
TELEGRAM_BOT_TOKEN=<token того же Telegram-бота>
TELEGRAM_BOT_USERNAME=<username без @>
TELEGRAM_BOT_ORDER_URL=https://industrious-benevolence-production-504e.up.railway.app/website-order
WEBSITE_ORDER_SECRET=<32+ случайных символа>

MANAGER_USERNAME=manager
MANAGER_PASSWORD=<сложный уникальный пароль>
KITCHEN_USERNAME=kitchen
KITCHEN_PASSWORD=<сложный уникальный пароль>
COURIER_USERNAME=courier
COURIER_PASSWORD=<сложный уникальный пароль>
```

Если Website имеет прямой резервный `GRAB_RECEIVER_URL`, добавьте также:

```text
RECEIPT_SECRET=<тот же секрет, что у Bot и Windows proxy>
```

Если прямой fallback не используется, Website `RECEIPT_SECRET` не нужен.

## Variables для BOT

Bot может **оставить свою отдельную DATABASE_URL**, если эта БД используется для ID пользователей/рассылок. Не переключайте её на основную БД Website без необходимости.

```text
TELEGRAM_BOT_TOKEN=<token>
DATABASE_URL=<ТЕКУЩАЯ отдельная БД бота>
ADMIN_CHAT_ID=<manager Telegram id>
WEBAPP_URL=https://<домен Website>
MANAGER_URL=https://t.me/<manager>
WEBSITE_ORDER_SECRET=<точно тот же, что у Website>
RECEIPT_SECRET=<отдельный 32+ символьный секрет>
PRINT_URL=https://<Cloudflare tunnel>/order
```

`WEBSITE_ORDER_SECRET` и `RECEIPT_SECRET` должны быть разными.

## Windows / чековая программа — обязательно

1. Оставьте чековую программу на `127.0.0.1:8000`.
2. Скопируйте папку `receipt-security-proxy` на Windows-компьютер.
3. Установите `RECEIPT_SECRET` — тот же, что в BOT.
4. Запустите proxy на `127.0.0.1:8002`.
5. Измените Cloudflare Tunnel: **не `localhost:8000`, а `localhost:8002`**.
6. Порт 8000 не публикуйте наружу другим туннелем/port-forwarding.

Пример CMD:

```bat
set RECEIPT_SECRET=ВАШ_СЛУЧАЙНЫЙ_СЕКРЕТ_32+
set UPSTREAM_RECEIPT_URL=http://127.0.0.1:8000
python secure_receipt_proxy.py
```

## База

При первом деплое Website `scripts/db-init.mjs` применит `database/schema.sql` и добавит:

- `staff_sessions`
- `security_rate_limits`

Основная БД Website + Mini App остаётся общей. БД Bot может оставаться отдельной.

## После деплоя проверить

- Старый URL с `?u=123&s=...` не авторизует пользователя.
- На сайте Telegram login работает, повторное использование старого callback/state не проходит.
- `/manager`, `/kitchen`, `/courier`: после логина пароль исчезает из формы/JS, refresh сохраняет сессию; после logout доступ пропадает.
- Шестая неверная попытка входа за 10 минут получает HTTP 429.
- Из DevTools подмена `delivery: 0` не меняет серверную цену доставки.
- Массовые гостевые заказы получают HTTP 429.
- `https://<old-mini-app>/server.js` и `/package.json` не должны отдавать исходники.
- POST на публичный чековый URL без `X-Receipt-Secret` получает 401.
