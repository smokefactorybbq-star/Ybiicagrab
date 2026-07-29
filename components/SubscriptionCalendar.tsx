"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mealTemplates } from "../data/meals";
import QuestionLink from "./QuestionLink";

type CalendarDay = {
  id: string;
  day: number;
  weekday: string;
  monthLabel: string;
  meal: (typeof mealTemplates)[number];
};

type SubscriptionDraft = {
  dates: string[];
  selectedDays: number;
  rate: number;
  total: number;
  createdAt: string;
};

const monthNames = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];
const weekdayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function bangkokTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function addDays(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function makeDays(): CalendarDay[] {
  const today = bangkokTodayIso();
  return Array.from({ length: 30 }, (_, index) => {
    const id = addDays(today, index + 1);
    const [year, month, day] = id.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return {
      id,
      day,
      weekday: weekdayNames[date.getUTCDay()],
      monthLabel: monthNames[month - 1],
      meal: mealTemplates[index % mealTemplates.length]
    };
  });
}

function getRate(selectedCount: number) {
  if (selectedCount === 0) return 0;
  if (selectedCount >= 30) return 250;
  if (selectedCount >= 7) return 300;
  return 350;
}

export default function SubscriptionCalendar() {
  const router = useRouter();
  const days = useMemo(() => makeDays(), []);
  const [selected, setSelected] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rate = getRate(selected.length);
  const total = selected.length * rate;

  function toggleDay(index: number) {
    setSelected((current) => {
      if (index === current.length && current.length < 30) {
        return [...current, days[index].id];
      }
      if (index < current.length) {
        return current.slice(0, index === current.length - 1 ? index : index + 1);
      }
      return current;
    });
  }

  function selectLength(length: number) {
    setSelected(days.slice(0, length).map((day) => day.id));
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" }));
  }

  function goToCheckout() {
    if (!selected.length) return;
    const draft: SubscriptionDraft = {
      dates: selected,
      selectedDays: selected.length,
      rate,
      total,
      createdAt: new Date().toISOString()
    };
    localStorage.setItem("mealpoint_subscription_draft", JSON.stringify(draft));
    router.push("/account?checkout=1");
  }

  return (
    <section id="subscription" className="subscription-section">
      <div className="section-heading split-heading">
        <div>
          <span className="eyebrow">Съедобная подписка</span>
          <h2>Целый месяц <em>неодинаковой</em> еды</h2>
          <p>Подписка начинается завтра. Добавляйте только последовательные дни — без пропусков.</p>
        </div>
        <QuestionLink />
      </div>

      <div className="calendar-actions consecutive-actions">
        <button type="button" className="text-button" onClick={() => selectLength(7)}>Выбрать 7 дней</button>
        <button type="button" className="text-button" onClick={() => selectLength(14)}>Выбрать 14 дней</button>
        <button type="button" className="text-button" onClick={() => selectLength(30)}>Выбрать 30 дней</button>
        <button type="button" className="text-button muted" onClick={() => setSelected([])}>Сбросить</button>
        <span className="pricing-hint">1–6 дней: 350 ฿ · 7–29 дней: 300 ฿ · 30 дней: 250 ฿</span>
      </div>

      <div className="calendar-scroll" ref={scrollRef}>
        {days.map((item, index) => {
          const isSelected = index < selected.length;
          const isNext = index === selected.length;
          const isDisabled = !isSelected && !isNext;
          return (
            <button
              type="button"
              key={item.id}
              className={`meal-day ${isSelected ? "selected" : ""} ${isNext ? "next-available" : ""}`}
              onClick={() => toggleDay(index)}
              aria-pressed={isSelected}
              disabled={isDisabled}
              title={isDisabled ? "Сначала выберите предыдущий день" : undefined}
            >
              <span className="date-row">
                <strong>{item.day}</strong>
                <span>{item.monthLabel} · {item.weekday}</span>
                {isSelected && <b aria-label="Выбрано">✓</b>}
              </span>
              <img src={item.meal.image} alt="" />
              <span className="meal-tag">{index === 0 ? "Начало завтра" : item.meal.tag}</span>
              <span className="meal-title">{item.meal.title}</span>
              <span className="meal-description">{item.meal.description}</span>
              {isNext && index > 0 && <span className="next-day-hint">Добавить следующий день</span>}
            </button>
          );
        })}
      </div>

      <div className="subscription-summary" aria-live="polite">
        <div>
          <small>Выбрано дней</small>
          <strong>{selected.length}</strong>
        </div>
        <div>
          <small>Цена за день</small>
          <strong>{rate ? `${rate} ฿` : "—"}</strong>
        </div>
        <div className="summary-total">
          <small>Итого</small>
          <strong>{total.toLocaleString("ru-RU")} ฿</strong>
        </div>
        <button type="button" disabled={!selected.length} onClick={goToCheckout}>
          Оформить подписку
        </button>
      </div>
    </section>
  );
}
