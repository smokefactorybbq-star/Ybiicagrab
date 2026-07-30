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
          <div className="hero-facts">
            <div><strong>от 250 ฿</strong><span>за полноценный обед</span></div>
            <div><strong>60+ блюд</strong><span>без скучного повторения</span></div>
            <div><strong>5 точек</strong><span>на Пхукете</span></div>
          </div>
        </div>
        <div className="hero-visual" aria-label="Пример обеда MealPoint">
          <div className="hero-card card-back"><img src="/meal-3.svg" alt="Лосось с овощами" /></div>
          <div className="hero-card card-middle"><img src="/meal-4.svg" alt="Кебаб с булгуром" /></div>
          <div className="hero-card card-front promo-card">
            <img src="/meal-of-the-day-promo.png" alt="30 дней еды без хлопот — 7 500 бат" />
          </div>
          <div className="floating-note">Никакой готовки<br /><strong>целый месяц</strong></div>
        </div>
      </section>

      <section className="benefits-strip">
        <div><b aria-hidden="true" /><span>Наша еда не надоест, потому что мы жарим, тушим, запекаем, готовим на пару и гриле. Безумие разнообразий вкуса.</span></div>
        <div><b aria-hidden="true" /><span>Забирай самостоятельно с пункта выдачи в любое удобное время.</span></div>
        <div><b aria-hidden="true" /><span>Незабываемый вкус, который сохранит бюджет.</span></div>
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

      <section className="reviews-section" aria-labelledby="reviews-title">
        <div className="reviews-heading">
          <div>
            <span className="eyebrow light">Наши отзывы</span>
            <h2 id="reviews-title">Что говорят подписчики MealPoint</h2>
          </div>
          <p>Обеды, которые удобно встроить в свой день — без готовки, лишних трат и повторяющегося меню.</p>
        </div>
        <div className="reviews-grid">
          <article>
            <div className="review-stars" aria-label="5 из 5">★★★★★</div>
            <blockquote>«Каждый день новое блюдо — за месяц меню ни разу не наскучило. Особенно люблю дни с запечённой рыбой и домашними котлетами».</blockquote>
            <footer><strong>Анна</strong><span>Rawai</span></footer>
          </article>
          <article>
            <div className="review-stars" aria-label="5 из 5">★★★★★</div>
            <blockquote>«Забираю обед по дороге с работы в удобное время. Не нужно ждать курьера, а на еду теперь уходит заметно меньше».</blockquote>
            <footer><strong>Максим</strong><span>Chalong</span></footer>
          </article>
          <article>
            <div className="review-stars" aria-label="5 из 5">★★★★★</div>
            <blockquote>«Подписка спасает в загруженные недели: вкусно, сытно и бюджет понятен заранее. Просто выбираю дни и забираю готовое».</blockquote>
            <footer><strong>Елена</strong><span>Kata</span></footer>
          </article>
        </div>
      </section>
    </main>
  );
}
