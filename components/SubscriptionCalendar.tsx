"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCourseDetails, getMealNutrition, getMealTemplateForDate, type MealTemplate } from "../data/meals";
import QuestionLink from "./QuestionLink";
import { pickupPoints } from "../data/pickupPoints";

type CalendarDay = {
  id: string;
  day: number;
  weekday: string;
  monthLabel: string;
  meal: MealTemplate;
};

type SubscriptionDraft = {
  dates: string[];
  selectedDays: number;
  rate: number;
  total: number;
  createdAt: string;
  fulfillmentType: "PICKUP" | "DELIVERY";
  pickupPointName?: string;
  duplicateConfirmed?: boolean;
};

type ExistingSubscription = {
  status: string;
  days: Array<{ service_date: string; status: string }>;
};

const monthNames = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const weekdayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MAX_SUBSCRIPTION_DAYS = 30;

function bangkokTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function addDays(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function makeDays(today: string): CalendarDay[] {
  return Array.from({ length: 180 }, (_, index) => {
    const id = addDays(today, index + 1);
    const [year, month, day] = id.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return { id, day, weekday: weekdayNames[date.getUTCDay()], monthLabel: monthNames[month - 1], meal: getMealTemplateForDate(id) };
  });
}

function getRate(selectedCount: number) {
  if (selectedCount === 0) return 0;
  if (selectedCount >= 30) return 250;
  if (selectedCount >= 7) return 300;
  return 350;
}

function sameDates(left: string[], right: string[]) {
  return left.length === right.length && left.every((date, index) => date === right[index]);
}

function formatLongDate(item: CalendarDay) {
  return `${item.day} ${item.monthLabel}, ${item.weekday}`;
}

export default function SubscriptionCalendar() {
  const router = useRouter();
  const [todayIso, setTodayIso] = useState(bangkokTodayIso());
  const [testMode, setTestMode] = useState(false);
  const days = useMemo(() => makeDays(todayIso), [todayIso]);
  const [selected, setSelected] = useState<string[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [fulfillmentOpen, setFulfillmentOpen] = useState(false);
  const [fulfillmentChoice, setFulfillmentChoice] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [chosenPickupPoint, setChosenPickupPoint] = useState(pickupPoints[0]?.name || "");
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [showFirstCourse, setShowFirstCourse] = useState(true);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [detailsIndex, setDetailsIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rate = getRate(selected.length);
  const total = selected.length * rate;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const nextIndex = selected.length;
  const detailsDay = detailsIndex === null ? null : days[detailsIndex];

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/app-time", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (cancelled || !data?.ok) return;
      const nextToday = String(data.clock.date || todayIso);
      setTodayIso(nextToday);
      setTestMode(Boolean(data.clock.isTestMode));
      setSelected([]);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rotation = window.setInterval(() => setShowFirstCourse((current) => !current), 5000);
    return () => window.clearInterval(rotation);
  }, []);

  useEffect(() => {
    if (detailsIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsIndex(null);
      if (event.key === "ArrowLeft") setDetailsIndex((current) => current === null ? current : Math.max(0, current - 1));
      if (event.key === "ArrowRight") setDetailsIndex((current) => current === null ? current : Math.min(days.length - 1, current + 1));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [detailsIndex, days.length]);

  function addNextDay() {
    if (selected.length >= MAX_SUBSCRIPTION_DAYS || nextIndex >= days.length) return;
    const nextDay = days[nextIndex];
    setSelected((current) => [...current, nextDay.id]);
    requestAnimationFrame(() => document.getElementById(`meal-day-${days[Math.min(nextIndex + 1, days.length - 1)].id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
  }

  function addNextDayFromModal() {
    if (selected.length >= MAX_SUBSCRIPTION_DAYS || nextIndex >= days.length) return;
    const indexToAdd = nextIndex;
    setSelected((current) => [...current, days[indexToAdd].id]);
    setDetailsIndex(Math.min(indexToAdd + 1, days.length - 1));
  }

  function moveCalendar(value: number) {
    setScrollPosition(value);
    const calendar = scrollRef.current;
    if (!calendar) return;
    const maximum = calendar.scrollWidth - calendar.clientWidth;
    calendar.scrollLeft = maximum * (value / 1000);
  }

  function syncCalendarSlider() {
    const calendar = scrollRef.current;
    if (!calendar) return;
    const maximum = calendar.scrollWidth - calendar.clientWidth;
    setScrollPosition(maximum > 0 ? Math.round((calendar.scrollLeft / maximum) * 1000) : 0);
  }

  function openFulfillmentChoice(isDuplicate = false) {
    setDuplicateConfirmed(isDuplicate);
    setDuplicateOpen(false);
    setFulfillmentOpen(true);
  }

  function saveDraftAndOpenAccount() {
    if (!selected.length) return;
    if (fulfillmentChoice === "PICKUP" && !chosenPickupPoint) {
      setCheckoutError("Выберите точку самовывоза");
      return;
    }
    const draft: SubscriptionDraft = {
      dates: selected,
      selectedDays: selected.length,
      rate,
      total,
      createdAt: new Date().toISOString(),
      fulfillmentType: fulfillmentChoice,
      pickupPointName: fulfillmentChoice === "PICKUP" ? chosenPickupPoint : undefined,
      duplicateConfirmed
    };
    localStorage.setItem("mealpoint_subscription_draft", JSON.stringify(draft));
    router.push("/account?checkout=1");
  }

  async function goToCheckout() {
    if (!selected.length) return;
    setCheckoutError("");
    setCheckingDuplicate(true);
    try {
      const meResponse = await fetch("/api/account/me", { cache: "no-store" });
      if (meResponse.status === 401) {
        openFulfillmentChoice(false);
        return;
      }
      const me = await meResponse.json();
      if (!meResponse.ok || !me.ok) throw new Error(me.error || "Не удалось проверить вход");

      const response = await fetch("/api/subscriptions/list", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось проверить подписки");
      const duplicate = (data.subscriptions as ExistingSubscription[]).some((subscription) => {
        if (subscription.status !== "ACTIVE") return false;
        return sameDates(subscription.days.map((day) => day.service_date), selected);
      });
      if (duplicate) setDuplicateOpen(true);
      else openFulfillmentChoice(false);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Ошибка проверки подписок");
    } finally {
      setCheckingDuplicate(false);
    }
  }

  const nextDayForButton = selected.length < MAX_SUBSCRIPTION_DAYS ? days[nextIndex] : null;

  return (
    <section id="subscription" className="subscription-section">
      <div className="section-heading split-heading">
        <div>
          <span className="eyebrow">Меню подписки</span>
          <h2>Выбирайте обеды <em>день за днём</em></h2>
          <p>Начните с завтрашнего дня и добавляйте следующий день в подписку. Нажмите на центр карточки, чтобы посмотреть состав, описание, калории и КБЖУ.</p>
        </div>
        <QuestionLink />
      </div>

      {testMode && <p className="test-mode-banner">Тестовый режим включён: календарь построен относительно {todayIso}.</p>}

      <div className="calendar-actions consecutive-actions">
        <button type="button" className="text-button muted" onClick={() => setSelected([])} disabled={!selected.length}>Сбросить выбранные дни</button>
        <span className="calendar-action-note">Добавляйте дни последовательно — следующий день становится доступен после предыдущего.</span>
      </div>

      <div className="calendar-scroll" ref={scrollRef} onScroll={syncCalendarSlider}>
        {days.map((item, index) => {
          const isSelected = selectedSet.has(item.id);
          const isNext = index === nextIndex && selected.length < MAX_SUBSCRIPTION_DAYS;
          const visibleCourse = showFirstCourse ? item.meal.firstCourse : item.meal.secondCourse;
          return (
            <article id={`meal-day-${item.id}`} key={item.id} className={`meal-day ${isSelected ? "selected" : ""} ${isNext ? "next-available" : ""}`}>
              <button
                type="button"
                className="meal-day-open-area"
                onClick={() => setDetailsIndex(index)}
                aria-label={`Открыть подробное меню на ${formatLongDate(item)}`}
              >
                <span className="date-row">
                  <strong>{item.day}</strong>
                  <span>{item.monthLabel} · {item.weekday}</span>
                  {isSelected && <b>✓</b>}
                </span>
                <span className="meal-image-frame">
                  <img key={`${item.id}-${showFirstCourse ? "first" : "second"}`} src={visibleCourse.image} alt={visibleCourse.title} loading="lazy" />
                  <span className="meal-course-badge">{showFirstCourse ? "Первое блюдо" : "Второе блюдо"}</span>
                  <span className="meal-open-overlay">Открыть меню и КБЖУ</span>
                </span>
                <span className="meal-tag">{item.id === days[0].id ? "Можно начать завтра" : item.meal.tag}</span>
                <span className="meal-title">{visibleCourse.title}</span>
                <span className="meal-details-hint">Нажмите на дату или блюдо — откроется подробное меню на весь экран</span>
              </button>

              <div className="meal-day-button-zone">
                <button
                  type="button"
                  className={`add-next-day-button ${isSelected ? "is-selected" : ""}`}
                  disabled={!isNext}
                  onClick={addNextDay}
                >
                  {isSelected
                    ? "✓ День добавлен"
                    : isNext
                      ? selected.length === 0
                        ? "+ Добавить первый день"
                        : "+ Добавить следующий день"
                      : "Сначала добавьте предыдущий день"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="calendar-drag-control">
        <input type="range" min="0" max="1000" value={scrollPosition} onChange={(event) => moveCalendar(Number(event.target.value))} aria-label="Горизонтальная прокрутка календаря" />
      </div>

      {checkoutError && <p className="form-error calendar-checkout-error">{checkoutError}</p>}
      <div className="subscription-summary" aria-live="polite">
        <div><small>Выбрано дней</small><strong>{selected.length}</strong></div>
        <div><small>Цена за день</small><strong>{rate ? `${rate} ฿` : "—"}</strong></div>
        <div className="summary-total"><small>Итого</small><strong>{total.toLocaleString("ru-RU")} ฿</strong></div>
        <button type="button" disabled={!selected.length || checkingDuplicate} onClick={goToCheckout}>{checkingDuplicate ? "Проверяем…" : "Оформить подписку"}</button>
      </div>

      {detailsDay && detailsIndex !== null && (() => {
        const first = getCourseDetails(detailsDay.meal.firstCourse, "first");
        const second = getCourseDetails(detailsDay.meal.secondCourse, "second");
        const totalNutrition = getMealNutrition(detailsDay.meal);
        return (
          <div className="meal-details-backdrop" role="dialog" aria-modal="true" aria-label={`Меню на ${formatLongDate(detailsDay)}`}>
            <div className="meal-details-modal">
              <button className="meal-details-close" type="button" onClick={() => setDetailsIndex(null)} aria-label="Закрыть">×</button>
              <button className="meal-details-arrow left" type="button" disabled={detailsIndex === 0} onClick={() => setDetailsIndex((current) => current === null ? current : Math.max(0, current - 1))} aria-label="Предыдущий день">←</button>
              <button className="meal-details-arrow right" type="button" disabled={detailsIndex === days.length - 1} onClick={() => setDetailsIndex((current) => current === null ? current : Math.min(days.length - 1, current + 1))} aria-label="Следующий день">→</button>

              <div className="meal-details-content">
                <div className="meal-details-heading">
                  <span className="eyebrow">Меню дня</span>
                  <h2>{formatLongDate(detailsDay)}</h2>
                  <p>{detailsDay.meal.title}</p>
                </div>

                <div className="meal-details-courses">
                  {[{label:"Первое блюдо",data:first},{label:"Второе блюдо",data:second}].map((course) => (
                    <article className="meal-details-course" key={course.label}>
                      <img src={course.data.image} alt={course.data.title} />
                      <div>
                        <span>{course.label}</span>
                        <h3>{course.data.title}</h3>
                        <p>{course.data.description}</p>
                        <div className="course-nutrition">
                          <b>{course.data.nutrition.calories} ккал</b>
                          <small>Б {course.data.nutrition.protein} г</small>
                          <small>Ж {course.data.nutrition.fat} г</small>
                          <small>У {course.data.nutrition.carbs} г</small>
                          <small>{course.data.nutrition.weight} г</small>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <section className="meal-total-nutrition">
                  <div><span>Весь обед</span><strong>{totalNutrition.weight} г</strong></div>
                  <div><span>Калории</span><strong>{totalNutrition.calories} ккал</strong></div>
                  <div><span>Белки</span><strong>{totalNutrition.protein} г</strong></div>
                  <div><span>Жиры</span><strong>{totalNutrition.fat} г</strong></div>
                  <div><span>Углеводы</span><strong>{totalNutrition.carbs} г</strong></div>
                </section>
                <p className="nutrition-disclaimer">Калорийность и КБЖУ сейчас указаны ориентировочно. Позже их можно заменить точными технологическими картами блюд.</p>
              </div>

              <div className="meal-details-footer">
                <div>
                  <small>В подписке выбрано</small>
                  <strong>{selected.length} дней</strong>
                  {nextDayForButton && <span>Следующий: {formatLongDate(nextDayForButton)}</span>}
                </div>
                <button type="button" disabled={!nextDayForButton} onClick={addNextDayFromModal}>
                  {nextDayForButton
                    ? selected.length === 0
                      ? `+ Добавить первый день — ${nextDayForButton.day} ${nextDayForButton.monthLabel}`
                      : `+ Добавить следующий день — ${nextDayForButton.day} ${nextDayForButton.monthLabel}`
                    : "Достигнут лимит выбранных дней"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {fulfillmentOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="payment-modal fulfillment-choice-modal">
            <button className="modal-close" type="button" onClick={() => setFulfillmentOpen(false)}>×</button>
            <span className="eyebrow">Получение подписки</span>
            <h2>Как вы хотите получать еду?</h2>
            <div className="fulfillment-switch">
              <button type="button" className={fulfillmentChoice === "PICKUP" ? "selected" : ""} onClick={() => setFulfillmentChoice("PICKUP")}>Самовывоз</button>
              <button type="button" className={fulfillmentChoice === "DELIVERY" ? "selected" : ""} onClick={() => setFulfillmentChoice("DELIVERY")}>Доставка</button>
            </div>
            {fulfillmentChoice === "PICKUP" && (
              <label>Точка выдачи
                <select value={chosenPickupPoint} onChange={(event) => setChosenPickupPoint(event.target.value)}>
                  {pickupPoints.map((point) => <option key={point.name} value={point.name}>{point.shortName} — {point.address}</option>)}
                </select>
              </label>
            )}
            <div className="package-preview">
              <span>{selected.length} дней</span><b>·</b><span>{fulfillmentChoice === "PICKUP" ? "Самовывоз" : "Доставка"}</span><strong>{total.toLocaleString("ru-RU")} ฿</strong>
            </div>
            <button type="button" onClick={saveDraftAndOpenAccount}>Перейти в личный кабинет</button>
          </div>
        </div>
      )}

      {duplicateOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="payment-modal duplicate-confirm-modal">
            <span className="eyebrow">Повторная подписка</span><h2>Оформить ещё одну?</h2>
            <p>У вас уже есть активная подписка на те же даты. Вы уверены, что хотите оформить ещё одну подписку на этот период?</p>
            <div className="duplicate-confirm-actions">
              <button type="button" className="confirm-yes" onClick={() => openFulfillmentChoice(true)}>Да, продолжить</button>
              <button type="button" className="confirm-no" onClick={() => setDuplicateOpen(false)}>Нет, выбрать другие даты</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
