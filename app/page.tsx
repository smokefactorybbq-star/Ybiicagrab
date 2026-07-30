import Link from "next/link";
import SubscriptionCalendar from "../components/SubscriptionCalendar";
import PhuketMap from "../components/PhuketMap";
import QuestionLink from "../components/QuestionLink";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow light">MealPoint Phuket</span>
          <h1>Готовим каждый день из свежих продуктов.<br /><em>Экономим ваше время и бюджет.</em></h1>
          <p>Разные сытные обеды на каждый выбранный день. Без закупок, готовки и одинаковой еды всю неделю.</p>
          <div className="hero-actions">
            <Link className="primary-link" href="#subscription">Выбрать дни</Link>
            <Link className="secondary-link" href="/delivery">Заказать доставку</Link>
            <QuestionLink className="question-link question-link-light" />
          </div>
          <div className="hero-facts">
            <div><strong>от 250 ฿</strong><span>за полноценный обед</span></div>
            <div><strong>60+ блюд</strong><span>без скучного повторения</span></div>
            <div><strong>5 точек</strong><span>на Пхукете</span></div>
          </div>
        </div>
        <div className="hero-visual" aria-label="Пример обеда MealPoint">
          <div className="hero-card card-back"><img src="/meal-3.svg" alt="Лосось с овощами" /></div>
          <div className="hero-card card-middle"><img src="/meal-4.svg" alt="Кебаб с булгуром" /></div>
          <div className="hero-card card-front">
            <span>Обед дня</span>
            <img src="/meal-1.svg" alt="Курица терияки с рисом" />
            <strong>Курица терияки с рисом</strong>
            <small>Завтра · Chalong Meal Point</small>
          </div>
          <div className="floating-note">Никакой готовки<br /><strong>целый месяц</strong></div>
        </div>
      </section>

      <section className="benefits-strip">
        <div><b>01</b><span><strong>Выбираете период</strong>Последовательные дни, начиная с завтра</span></div>
        <div><b>02</b><span><strong>Подписка активируется</strong>В течение 15 минут после оплаты</span></div>
        <div><b>03</b><span><strong>Получаете QR</strong>По QR-коду забираете свой заказ в любое удобное для вас время</span></div>
      </section>

      <section className="referral-promo" aria-label="Бонус за приглашённого друга">
        <div className="referral-badge">+1 день</div>
        <div>
          <span className="eyebrow">Бонус за рекомендацию</span>
          <h2>Бесплатный день подписки за друга, который оформил заказ!</h2>
          <p>Пригласите друга в MealPoint. После оформления и оплаты его заказа мы добавим к вашей подписке один бесплатный день.</p>
        </div>
        <QuestionLink className="question-link referral-question-link" />
      </section>

      <SubscriptionCalendar />
      <PhuketMap />

      <section className="partner-callout">
        <div>
          <span className="eyebrow light">Для ресторанов</span>
          <h2>Ваше меню — в единой системе MealPoint</h2>
          <p>Партнёр получает заказ со звуком, выставляет время приготовления, а клиент видит расчётное время готовности и доставки.</p>
        </div>
        <div className="partner-actions"><button type="button">Стать партнёром</button><QuestionLink className="question-link question-link-light" /></div>
      </section>
    </main>
  );
}
