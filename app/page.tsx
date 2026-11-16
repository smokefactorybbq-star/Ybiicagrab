"use client";

import {Translated,useLanguage} from "../components/LanguageProvider";
import {getLocale} from "../lib/i18n/translate";
import { useState } from "react";
import SubscriptionCalendar from "../components/SubscriptionCalendar";
import PhuketMap from "../components/PhuketMap";

export default function HomePage() {
  const {t,language}=useLanguage();

  const [mealIncludesOpen,setMealIncludesOpen]=useState(false);

  return (
    <main id="top">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow light">MealPoint Phuket</span>
          <h1><Translated>{"Готовим каждый день из свежих продуктов."}</Translated><br /><em><Translated>{"Экономим ваше время и бюджет."}</Translated></em></h1>
          <p><Translated>{"Выберите количество дней подписки, способ получения и забирайте или получайте готовый обед в выбранные дни."}</Translated></p>
          <div className="hero-facts">
            <div><strong>350 ฿</strong><span><Translated>{"за полноценный обед"}</Translated></span></div>
            <div><strong><Translated>{"60+ блюд"}</Translated></strong><span><Translated>{"разное меню по дням"}</Translated></span></div>
            <div><strong><Translated>{"Самовывоз"}</Translated></strong><span><Translated>{"из удобной точки на Пхукете"}</Translated></span></div>
          </div>
        </div>
        <div className="hero-visual" aria-label={t("Пример обеда MealPoint")}>
          <div className="hero-card card-back"><img src="/meal-3.svg" alt={t("Обед MealPoint")} /></div>
          <div className="hero-card card-middle"><img src="/meal-4.svg" alt={t("Обед MealPoint")} /></div>
          <div className="hero-card card-front promo-card">
            <img src="/meal-of-the-day-promo.png" alt={t("30 дней еды без хлопот")} />
          </div>
          <button type="button" className="floating-note floating-note-button" onClick={()=>setMealIncludesOpen(true)}><Translated>{"Узнать, что входит"}</Translated><br /><strong><Translated>{"в обед?"}</Translated></strong></button>
        </div>
      </section>

      <section className="benefits-strip">
        <div><b aria-hidden="true" /><span><Translated>{"Вы выбираете нужное количество дней подписки."}</Translated></span></div>
        <div><b aria-hidden="true" /><span><Translated>{"Получение: доставка или самовывоз с выбранной точки выдачи."}</Translated></span></div>
        <div><b aria-hidden="true" /><span><Translated>{"Оплачивай любым удобным способом."}</Translated></span></div>
      </section>

      <SubscriptionCalendar />
      <PhuketMap />

      {mealIncludesOpen&&<div className="meal-details-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)setMealIncludesOpen(false)}}><div className="meal-details-modal" role="dialog" aria-modal="true" aria-labelledby="meal-includes-title"><button type="button" className="meal-details-close" aria-label={t("Закрыть")} onClick={()=>setMealIncludesOpen(false)}>×</button><div className="meal-details-content"><div className="meal-details-heading"><span className="eyebrow"><Translated>{"Состав обеда"}</Translated></span><h2 id="meal-includes-title"><Translated>{"Что входит в обед?"}</Translated></h2><p><Translated>{"Каждый день — полноценный набор MealPoint из первого, второго и дополнений."}</Translated></p></div><div className="meal-details-courses"><article className="meal-details-course meal-includes-course" style={{gridColumn:"1 / -1"}}><div className="meal-includes-copy"><span><Translated>{"Полный набор"}</Translated></span><h3><Translated>{"В каждом обеде"}</Translated></h3><p><Translated>{"1. Наваристый суп."}</Translated></p><p><Translated>{"2. Сытное второе блюдо."}</Translated></p><p><Translated>{"3. Ломтик свежего хлеба."}</Translated></p><p><Translated>{"4. Фрукты."}</Translated></p><p><Translated>{"5. Компот или морс."}</Translated></p><p><Translated>{"6. Столовые приборы."}</Translated></p></div><div className="course-image-wrap meal-includes-image"><img src="/menu/4totam.jpeg" alt={t("Что входит в обед MealPoint")}/></div></article></div></div></div></div>}
    </main>
  );
}
