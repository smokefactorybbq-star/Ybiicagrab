"use client";

import { useState } from "react";
import SubscriptionCalendar from "../components/SubscriptionCalendar";
import PhuketMap from "../components/PhuketMap";

export default function HomePage() {
  const [mealIncludesOpen,setMealIncludesOpen]=useState(false);

  return (
    <main id="top">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow light">MealPoint Phuket</span>
          <h1>Готовим каждый день из свежих продуктов.<br /><em>Экономим ваше время и бюджет.</em></h1>
          <p>Выберите количество дней подписки, способ получения и забирайте или получайте готовый обед в выбранные дни.</p>
          <div className="hero-facts">
            <div><strong>350 ฿</strong><span>за полноценный обед</span></div>
            <div><strong>60+ блюд</strong><span>разное меню по дням</span></div>
            <div><strong>Самовывоз</strong><span>из удобной точки на Пхукете</span></div>
          </div>
        </div>
        <div className="hero-visual" aria-label="Пример обеда MealPoint">
          <div className="hero-card card-back"><img src="/meal-3.svg" alt="Обед MealPoint" /></div>
          <div className="hero-card card-middle"><img src="/meal-4.svg" alt="Обед MealPoint" /></div>
          <div className="hero-card card-front promo-card">
            <img src="/meal-of-the-day-promo.png" alt="30 дней еды без хлопот" />
          </div>
          <button type="button" className="floating-note floating-note-button" onClick={()=>setMealIncludesOpen(true)}>Узнать, что входит<br /><strong>в обед?</strong></button>
        </div>
      </section>

      <section className="benefits-strip">
        <div><b aria-hidden="true" /><span>Вы выбираете нужное количество дней подписки.</span></div>
        <div><b aria-hidden="true" /><span>Получение: доставка или самовывоз с выбранной точки выдачи.</span></div>
        <div><b aria-hidden="true" /><span>Оплачивай любым удобным способом.</span></div>
      </section>

      <SubscriptionCalendar />
      <PhuketMap />

      {mealIncludesOpen&&<div className="modal-backdrop meal-includes-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)setMealIncludesOpen(false)}}><section className="payment-modal meal-includes-modal" role="dialog" aria-modal="true" aria-labelledby="meal-includes-title"><button type="button" className="modal-close" aria-label="Закрыть" onClick={()=>setMealIncludesOpen(false)}>×</button><span className="eyebrow">MealPoint</span><h2 id="meal-includes-title">Что входит в обед?</h2><img className="meal-includes-image" src="/menu/4totam.jpeg" alt="Что входит в обед MealPoint"/><ol className="meal-includes-list"><li>Наваристый суп.</li><li>Сытное второе блюдо.</li><li>Ломтик свежего хлеба.</li><li>Фрукты.</li><li>Компот или морс.</li><li>Одноразовая посуда.</li></ol></section></div>}
    </main>
  );
}
