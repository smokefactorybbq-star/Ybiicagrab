"use client";

import { useMemo, useRef, useState } from "react";
import { mealTemplates } from "@/data/meals";

type CalendarDay = {
  id: string;
  day: number;
  weekday: string;
  monthLabel: string;
  meal: (typeof mealTemplates)[number];
};

const monthNames = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const weekdayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function makeMonth(year: number, monthIndex: number): CalendarDay[] {
  const count = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, monthIndex, index + 1);
    return {
      id: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
      day: index + 1,
      weekday: weekdayNames[date.getDay()],
      monthLabel: monthNames[monthIndex],
      meal: mealTemplates[(index + monthIndex) % mealTemplates.length]
    };
  });
}

function getRate(selectedCount: number, monthLength: number) {
  if (selectedCount === 0) return 0;
  if (selectedCount === monthLength) return 250;
  if (selectedCount >= 7) return 300;
  return 350;
}

export default function SubscriptionCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [selected, setSelected] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => makeMonth(year, monthIndex), [year, monthIndex]);
  const selectedInMonth = selected.filter((id) => id.startsWith(`${year}-${String(monthIndex + 1).padStart(2, "0")}`));
  const rate = getRate(selectedInMonth.length, days.length);
  const total = selectedInMonth.length * rate;

  function switchMonth(offset: number) {
    const next = new Date(year, monthIndex + offset, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
    setSelected([]);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" }));
  }

  function toggleDay(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function selectWholeMonth() {
    const monthIds = days.map((day) => day.id);
    setSelected((current) => [...current.filter((id) => !monthIds.includes(id)), ...monthIds]);
  }

  function clearMonth() {
    const monthIds = new Set(days.map((day) => day.id));
    setSelected((current) => current.filter((id) => !monthIds.has(id)));
  }

  return (
    <section id="subscription" className="subscription-section">
      <div className="section-heading split-heading">
        <div>
          <span className="eyebrow">Съедобная подписка</span>
          <h2>Целый месяц <em>неодинаковой</em> еды</h2>
          <p>Выберите любые дни. В каждом дне уже видно, что будет на обед.</p>
        </div>
        <div className="month-controls" aria-label="Переключение месяца">
          <button type="button" onClick={() => switchMonth(-1)} aria-label="Предыдущий месяц">←</button>
          <strong>{monthNames[monthIndex]} {year}</strong>
          <button type="button" onClick={() => switchMonth(1)} aria-label="Следующий месяц">→</button>
        </div>
      </div>

      <div className="calendar-actions">
        <button type="button" className="text-button" onClick={selectWholeMonth}>Выбрать весь месяц</button>
        <button type="button" className="text-button muted" onClick={clearMonth}>Сбросить месяц</button>
        <span className="pricing-hint">1–6 дней: 350 ฿ · от 7 дней: 300 ฿ · весь месяц: 250 ฿</span>
      </div>

      <div className="calendar-scroll" ref={scrollRef}>
        {days.map((item) => {
          const isSelected = selected.includes(item.id);
          return (
            <button
              type="button"
              key={item.id}
              className={`meal-day ${isSelected ? "selected" : ""}`}
              onClick={() => toggleDay(item.id)}
              aria-pressed={isSelected}
            >
              <span className="date-row">
                <strong>{item.day}</strong>
                <span>{item.weekday}</span>
                {isSelected && <b aria-label="Выбрано">✓</b>}
              </span>
              <img src={item.meal.image} alt="" />
              <span className="meal-tag">{item.meal.tag}</span>
              <span className="meal-title">{item.meal.title}</span>
              <span className="meal-description">{item.meal.description}</span>
            </button>
          );
        })}
      </div>

      <div className="subscription-summary" aria-live="polite">
        <div>
          <small>Выбрано дней</small>
          <strong>{selectedInMonth.length}</strong>
        </div>
        <div>
          <small>Цена за день</small>
          <strong>{rate ? `${rate} ฿` : "—"}</strong>
        </div>
        <div className="summary-total">
          <small>Итого</small>
          <strong>{total.toLocaleString("ru-RU")} ฿</strong>
        </div>
        <button
          type="button"
          disabled={!selectedInMonth.length}
          onClick={() => alert("Следующий шаг: вход через Telegram и выбор пункта выдачи.")}
        >
          Оформить подписку
        </button>
      </div>
    </section>
  );
}

