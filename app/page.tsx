import SubscriptionCalendar from "../components/SubscriptionCalendar";
import PhuketMap from "../components/PhuketMap";

export default function HomePage() {
  return (
    <main id="top">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow light">MealPoint Phuket</span>
          <h1>Готовим каждый день из свежих продуктов.<br /><em>Экономим ваше время и бюджет.</em></h1>
          <p>Выберите количество дней подписки, способ получения и забирайте или получайте готовый обед в выбранные дни.</p>
          <div className="hero-facts">
            <div><strong>от 250 ฿</strong><span>за полноценный обед</span></div>
            <div><strong>60+ блюд</strong><span>разное меню по дням</span></div>
            <div><strong>5 точек</strong><span>самовывоза на Пхукете</span></div>
          </div>
        </div>
        <div className="hero-visual" aria-label="Пример обеда MealPoint">
          <div className="hero-card card-back"><img src="/meal-3.svg" alt="Обед MealPoint" /></div>
          <div className="hero-card card-middle"><img src="/meal-4.svg" alt="Обед MealPoint" /></div>
          <div className="hero-card card-front promo-card">
            <img src="/meal-of-the-day-promo.png" alt="30 дней еды без хлопот" />
          </div>
          <div className="floating-note">Выберите дни<br /><strong>и способ получения</strong></div>
        </div>
      </section>

      <section className="benefits-strip">
        <div><b aria-hidden="true" /><span>Вы выбираете нужное количество дней подписки.</span></div>
        <div><b aria-hidden="true" /><span>Получение: доставка или самовывоз с выбранной точки выдачи.</span></div>
        <div><b aria-hidden="true" /><span>При самовывозе полученный день списывается через QR в личном кабинете.</span></div>
      </section>

      <SubscriptionCalendar />
      <PhuketMap />
    </main>
  );
}
