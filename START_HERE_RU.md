# Smoke Factory BBQ — отдельный сайт кафе

Это проект для `smokefactorybbq.com`. MealPoint в него не встроен: на MealPoint ведёт только рекламная ссылка `https://meal-point.com`.

## Что сделано
- обязательный вход через Telegram;
- используется та же Telegram-база клиентов, что и у существующего Mini App;
- доставка / самовывоз;
- Cash доступен только для самовывоза;
- для доставки требуется точка на Google Maps;
- заказ ко времени — минимум через 1 час;
- PromptPay QR генерируется из корпоративного QR с суммой `Total`;
- заказ PromptPay создаётся после кнопки «Я оплатил»;
- заказ передаётся в существующий `tgfoodbot` на `/website-order`;
- tgfoodbot дальше отправляет заказ на кухонный экран, в чековую программу и клиенту.

## Railway
1. Создайте отдельный сервис сайта из этого проекта.
2. Подключите PostgreSQL, которую уже использует `tgfoodbot`/Mini App.
3. Скопируйте переменные из `.env.example` в Railway Variables.
4. `WEBSITE_ORDER_SECRET` должен совпасть на сайте и в `tgfoodbot`.
5. `TELEGRAM_BOT_ORDER_URL` должен быть вида `https://<bot-domain>/website-order`.
6. Привяжите `smokefactorybbq.com`.

## Важно
Не добавляйте MealPoint DATABASE_URL в этот проект. База MealPoint отдельная.
