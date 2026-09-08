import QuestionLink from "../../components/QuestionLink";

export default function ContactsPage() {
  return (
    <main className="page-shell contacts-page">
      <section className="page-intro page-intro-with-action">
        <div>
          <span className="eyebrow">Контакты</span>
          <h1>Smoke Factory BBQ</h1>
          <p>Заказы из кафе оформляются на сайте после входа через Telegram. По вопросам заказа напишите нашему боту или менеджеру.</p>
        </div>
        <QuestionLink />
      </section>
      <div className="contact-grid">
        <article><span>Компания</span><strong>Smoke Factory BBQ Co., Ltd.</strong><p>Phuket, Thailand</p></article>
        <article><span>Координаты кафе</span><strong>7.910335, 98.368771</strong><p>Точка отправления доставки</p></article>
        <article><span>Заказы</span><strong>Telegram + smokefactorybbq.com</strong><p>Один аккаунт для Mini App и сайта кафе</p></article>
        <article><span>Подписка на обеды</span><strong>MealPoint</strong><p><a href="https://meal-point.com">meal-point.com</a> — отдельный сервис</p></article>
      </div>
    </main>
  );
}
