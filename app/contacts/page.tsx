import QuestionLink from "../../components/QuestionLink";

export default function ContactsPage() {
  return (
    <main className="page-shell contacts-page">
      <section className="page-intro page-intro-with-action">
        <div>
          <span className="eyebrow">Контакты</span>
          <h1>MealPoint</h1>
          <p>MealPoint — отдельный сервис подписки на готовые обеды на Пхукете. Для заказов из меню Smoke Factory используйте отдельный сайт.</p>
        </div>
        <QuestionLink />
      </section>
      <div className="contact-grid">
        <article><span>Сервис</span><strong>MealPoint by Smoke Factory BBQ</strong><p>Phuket, Thailand</p></article>
        <article><span>Аккаунт</span><strong>Вход по SMS-коду</strong><p>Поддерживаются международные номера</p></article>
        <article><span>Оплата</span><strong>PromptPay / Cash</strong><p>PromptPay подтверждается загрузкой чека</p></article>
        <article><span>Кафе Smoke Factory</span><strong><a href="https://smokefactorybbq.com">smokefactorybbq.com</a></strong><p>Обычные заказы из кафе оформляются отдельно</p></article>
      </div>
    </main>
  );
}
