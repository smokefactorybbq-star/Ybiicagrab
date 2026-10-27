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

      {mealIncludesOpen&&<div className="meal-details-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)setMealIncludesOpen(false)}}><div className="meal-details-modal" role="dialog" aria-modal="true" aria-labelledby="meal-includes-title"><button type="button" className="meal-details-close" aria-label="Закрыть" onClick={()=>setMealIncludesOpen(false)}>×</button><div className="meal-details-content"><div className="meal-details-heading"><span className="eyebrow">Состав обеда</span><h2 id="meal-includes-title">Что входит в обед?</h2><p>Каждый день — полноценный набор MealPoint из первого, второго и дополнений.</p></div><div className="meal-details-courses"><article className="meal-details-course" style={{gridColumn:"1 / -1"}}><div className="course-image-wrap"><img src="/menu/4totam.jpeg" alt="Что входит в обед MealPoint"/></div><div><span>Полный набор</span><h3>В каждом обеде</h3><p>1. Наваристый суп.</p><p>2. Сытное второе блюдо.</p><p>3. Ломтик свежего хлеба.</p><p>4. Фрукты.</p><p>5. Компот или морс.</p><p>6. Одноразовая посуда.</p></div></article></div></div></div></div>}
    </main>
  );
}
