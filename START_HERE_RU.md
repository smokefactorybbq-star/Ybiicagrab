# MealPoint — отдельный сайт подписки

Это отдельный проект для `meal-point.com` и отдельной PostgreSQL базы.

## Что сделано
- регистрация и вход по SMSMKT OTP для международных номеров;
- ссылка Smoke Factory в шапке ведёт на `https://smokefactorybbq.com`;
- подписки, дни, QR, кухня и менеджер относятся только к MealPoint;
- PromptPay QR формируется из корпоративного Thai QR с точной суммой подписки;
- Cash создаёт заявку и уведомляет менеджера;
- PromptPay остаётся `AWAITING_ACTIVATION` до загрузки и проверки чека;
- клиент загружает JPG/PNG/WEBP/PDF в личном кабинете;
- чек сохраняется в MealPoint DB и пересылается менеджеру через `tgfoodbot`;
- менеджер активирует подписку вручную.

## Railway
1. Создайте НОВУЮ PostgreSQL специально для MealPoint.
2. Создайте отдельный Railway service из этого проекта.
3. Добавьте Variables из `.env.example`.
4. В SMSMKT создайте OTP project и заполните `SMSMKT_API_KEY`, `SMSMKT_SECRET_KEY`, `SMSMKT_PROJECT_KEY`.
5. `MEALPOINT_BOT_SECRET` должен совпасть с `tgfoodbot`.
6. `TGFOODBOT_URL` — базовый URL бота без `/mealpoint/...`.
7. Привяжите `meal-point.com`.
