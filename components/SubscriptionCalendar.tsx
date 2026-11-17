"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "./LanguageProvider";
import { getCourseDetails, getMealNutrition, getMealTemplateForDate, type MealTemplate } from "../data/meals";
import QuestionLink from "./QuestionLink";
import {useCatalog} from "./useCatalog";
import DiscountBadge from "./DiscountBadge";
import {priceForDates,priceForDay} from "../lib/meal-prices";

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
  pickupPointCode?: string;
  duplicateConfirmed?: boolean;
};

type ExistingSubscription = {
  status: string;
  days: Array<{ service_date: string; status: string }>;
};

const monthNames = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const weekdayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

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
  return 350;
}

function sameDates(left: string[], right: string[]) {
  return left.length === right.length && left.every((date, index) => date === right[index]);
}

function formatLongDate(item: CalendarDay) {
  return `${item.day} ${item.monthLabel}, ${item.weekday}`;
}

export default function SubscriptionCalendar() {
  const { t, language } = useLanguage();
  const locale = language === "en" ? "en-GB" : "ru-RU";
  const router = useRouter();
  const {points:pickupPoints,discounts,ready:catalogReady,error:catalogError}=useCatalog();
  const [todayIso, setTodayIso] = useState(bangkokTodayIso());
  const [testMode, setTestMode] = useState(false);
  const days = useMemo(() => makeDays(todayIso), [todayIso]);
  const [selected, setSelected] = useState<string[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [fulfillmentOpen, setFulfillmentOpen] = useState(false);
  const [fulfillmentChoice, setFulfillmentChoice] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [chosenPickupPoint, setChosenPickupPoint] = useState("");
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [showFirstCourse, setShowFirstCourse] = useState(true);
  const [imagesRotating, setImagesRotating] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [detailsIndex, setDetailsIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {rate,total,loyaltyPercent,savings}=priceForDates(selected,discounts);
  useEffect(()=>{if(!pickupPoints.some(p=>p.code===chosenPickupPoint))setChosenPickupPoint(pickupPoints[0]?.code||"");},[pickupPoints,chosenPickupPoint]);
  useEffect(()=>{const select=(e:Event)=>setChosenPickupPoint((e as CustomEvent<string>).detail);window.addEventListener("mealpoint-pickup-selected",select);return()=>window.removeEventListener("mealpoint-pickup-selected",select);},[]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
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
    const rotation = window.setInterval(() => {
      setImagesRotating(true);
      setShowFirstCourse((current) => !current);
    }, 7000);
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

  function toggleDay(date: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return [...next].sort();
    });
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
    if (!selected.length||!catalogReady) return;
    if (!chosenPickupPoint) {
      setCheckoutError(t("Выберите пункт выдачи"));
      return;
    }
    const draft: SubscriptionDraft = {
      dates: selected,
      selectedDays: selected.length,
      rate,
      total,
      createdAt: new Date().toISOString(),
      fulfillmentType: fulfillmentChoice,
      pickupPointName: pickupPoints.find(p=>p.code===chosenPickupPoint)?.name,
      pickupPointCode: chosenPickupPoint,
      duplicateConfirmed
    };
    localStorage.setItem("mealpoint_subscription_draft", JSON.stringify(draft));
    router.push("/account?checkout=1#new-subscription");
  }

  async function goToCheckout() {
    if (!selected.length||!catalogReady) return;
    setCheckoutError("");
    setCheckingDuplicate(true);
    try {
      const meResponse = await fetch("/api/account/me", { cache: "no-store" });
      if (meResponse.status === 401) {
        openFulfillmentChoice(false);
        return;
      }
      const me = await meResponse.json();
      if (!meResponse.ok || !me.ok) throw new Error(me.error || t("Не удалось проверить вход"));

      const response = await fetch("/api/subscriptions/list", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || t("Не удалось проверить подписки"));
      const duplicate = (data.subscriptions as ExistingSubscription[]).some((subscription) => {
        if (subscription.status !== "ACTIVE") return false;
        return sameDates(subscription.days.map((day) => day.service_date), selected);
      });
      if (duplicate) setDuplicateOpen(true);
      else openFulfillmentChoice(false);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : t("Ошибка проверки подписок"));
    } finally {
      setCheckingDuplicate(false);
    }
  }

  return (
    <section id="subscription" className="subscription-section">
      <div className="section-heading split-heading">
        <div>
          <span className="eyebrow">{t("Меню подписки")}</span>
          <h2>{t("Выбирайте обеды ")}<em>{t("на любые дни")}</em></h2>
          <p>{t("Выбирайте любые удобные даты начиная с завтрашнего дня: подряд или с пропусками. Нажмите на центр карточки, чтобы посмотреть состав, описание, калории и КБЖУ.")}</p>
        </div>
        <QuestionLink />
      </div>

      {testMode && <p className="test-mode-banner">{t("Тестовый режим включён: календарь построен относительно ")}{todayIso}.</p>}

      <div className="calendar-actions consecutive-actions">
        <button type="button" className="text-button muted" onClick={() => setSelected([])} disabled={!selected.length}>{t("Сбросить выбранные дни")}</button>
        <span className="calendar-action-note">{t("Можно выбрать любые дни с пропусками — ограничений по последовательности нет.")}</span>
      </div>

      <div className="calendar-scroll" ref={scrollRef} onScroll={syncCalendarSlider}>
        {days.map((item, index) => {
          const isSelected = selectedSet.has(item.id);
          const visibleCourse = showFirstCourse ? item.meal.firstCourse : item.meal.secondCourse;
          return (
            <article id={`meal-day-${item.id}`} key={item.id} className={`meal-day ${isSelected ? "selected" : ""}`}>
              <button
                type="button"
                className="meal-day-open-area"
                onClick={() => setDetailsIndex(index)}
                aria-label={t(`Открыть подробное меню на ${formatLongDate(item)}`)}
              >
                <span className="date-row">
                  <strong>{item.day}</strong>
                  <span>{t(item.monthLabel)} · {t(item.weekday)}</span>
                  {isSelected && <b>✓</b>}
                </span>
                <span className="meal-image-frame" data-rotating={imagesRotating}>
                  <DiscountBadge percent={discounts[item.id]}/>
                  <img
                    className={`meal-slide ${showFirstCourse ? "is-active" : "is-outgoing"}`}
                    src={item.meal.firstCourse.image}
                    alt={showFirstCourse ? t(item.meal.firstCourse.title) : ""}
                    aria-hidden={!showFirstCourse}
                    loading="lazy"
                  />
                  <img
                    className={`meal-slide ${!showFirstCourse ? "is-active" : "is-outgoing"}`}
                    src={item.meal.secondCourse.image}
                    alt={!showFirstCourse ? t(item.meal.secondCourse.title) : ""}
                    aria-hidden={showFirstCourse}
                    loading="lazy"
                  />
                  <span className="meal-course-badge">{showFirstCourse ? t("Первое блюдо") : t("Второе блюдо")}</span>
                  <span className="meal-open-overlay">{t("Открыть меню и КБЖУ")}</span>
                </span>
                <span className="meal-tag">{item.id === days[0].id ? t("Можно начать завтра") : t(item.meal.tag)}</span>
                <span className="meal-title">{t(visibleCourse.title)}</span>
                <span className="day-price">{(discounts[item.id]||isSelected&&loyaltyPercent>0)&&<del>350 ฿</del>} {priceForDay(item.id,discounts,isSelected?loyaltyPercent:0).price} ฿</span>
                <span className="meal-details-hint">{t("Нажмите на дату или блюдо — откроется подробное меню на весь экран")}</span>
              </button>

              <div className="meal-day-button-zone">
                <button
                  type="button"
                  className={`add-next-day-button ${isSelected ? "is-selected" : ""}`}
                  onClick={() => toggleDay(item.id)}
                >
                  {isSelected ? t("Сбросить день") : t("+ Добавить день")}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="calendar-drag-control">
        <input type="range" min="0" max="1000" value={scrollPosition} onChange={(event) => moveCalendar(Number(event.target.value))} aria-label={t("Горизонтальная прокрутка календаря")} />
      </div>

      {catalogError&&<p className="form-error">{t(catalogError)}</p>}
      {checkoutError && <p className="form-error calendar-checkout-error">{t(checkoutError)}</p>}
      <div className="subscription-summary" aria-live="polite">
        <div><small>{t("Выбрано дней")}</small><strong>{selected.length}</strong></div>
        <div><small>{loyaltyPercent ? t(`Скидка лояльности ${loyaltyPercent}%`) : t("Базовая цена за день")}</small><strong>{loyaltyPercent ? `−${savings.toLocaleString(locale)} ฿` : rate ? `${rate} ฿` : "—"}</strong></div>
        <div className="summary-total"><small>{t("Итого")}</small><strong>{total.toLocaleString(locale)} ฿</strong></div>
        <button type="button" disabled={!selected.length || checkingDuplicate || !catalogReady} onClick={goToCheckout}>{checkingDuplicate ? t("Проверяем…") : t("Оформить подписку")}</button>
      </div>

      {detailsDay && detailsIndex !== null && (() => {
        const first = getCourseDetails(detailsDay.meal.firstCourse, "first");
        const second = getCourseDetails(detailsDay.meal.secondCourse, "second");
        const totalNutrition = getMealNutrition(detailsDay.meal);
        return (
          <div className="meal-details-backdrop" role="dialog" aria-modal="true" aria-label={t(`Меню на ${t(formatLongDate(detailsDay))}`)}>
            <div className="meal-details-modal">
              <button className="meal-details-close" type="button" onClick={() => setDetailsIndex(null)} aria-label={t("Закрыть")}>×</button>
              <button className="meal-details-arrow left" type="button" disabled={detailsIndex === 0} onClick={() => setDetailsIndex((current) => current === null ? current : Math.max(0, current - 1))} aria-label={t("Предыдущий день")}>←</button>
              <button className="meal-details-arrow right" type="button" disabled={detailsIndex === days.length - 1} onClick={() => setDetailsIndex((current) => current === null ? current : Math.min(days.length - 1, current + 1))} aria-label={t("Следующий день")}>→</button>

              <div className="meal-details-content">
                <div className="meal-details-heading">
                  <span className="eyebrow">{t("Меню дня")}</span>
                  <h2>{t(formatLongDate(detailsDay))}</h2>
                  <p>{t(detailsDay.meal.title)}</p>
                </div>

                <div className="meal-details-courses">
                  {[{label:t("Первое блюдо"),data:first},{label:t("Второе блюдо"),data:second}].map((course) => (
                    <article className="meal-details-course" key={course.label}>
                      <div className="course-image-wrap"><img src={course.data.image} alt={t(course.data.title)} /><DiscountBadge percent={discounts[detailsDay.id]}/></div>
                      <div>
                        <h3>{t(course.data.title)}</h3>
                        <div className="course-nutrition">
                          <b>{course.data.nutrition.calories} {t("ккал")}</b>
                          <small>{t("Б ")}{course.data.nutrition.protein} {t("г")}</small>
                          <small>{t("Ж ")}{course.data.nutrition.fat} {t("г")}</small>
                          <small>{t("У ")}{course.data.nutrition.carbs} {t("г")}</small>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <section className="meal-total-nutrition">
                  <div><span>{t("Весь обед")}</span><strong>{totalNutrition.weight} {t("г")}</strong></div>
                  <div><span>{t("Калории")}</span><strong>{totalNutrition.calories} {t("ккал")}</strong></div>
                  <div><span>{t("Белки")}</span><strong>{totalNutrition.protein} {t("г")}</strong></div>
                  <div><span>{t("Жиры")}</span><strong>{totalNutrition.fat} {t("г")}</strong></div>
                  <div><span>{t("Углеводы")}</span><strong>{totalNutrition.carbs} {t("г")}</strong></div>
                </section>
                <p className="nutrition-disclaimer">{t("Пищевая ценность указана ориентировочно. Состав и вес готового блюда могут немного отличаться.")}</p>
              </div>

              <div className="meal-details-footer">
                <div>
                  <small>{t("В подписке выбрано")}</small>
                  <strong>{selected.length} {t("дней")}</strong>
                  <span>{selectedSet.has(detailsDay.id) ? t("Этот день выбран") : t("Этот день пока не выбран")}</span>
                </div>
                <button type="button" onClick={() => toggleDay(detailsDay.id)}>
                  {selectedSet.has(detailsDay.id) ? t("Сбросить день") : t(`+ Добавить день — ${detailsDay.day} ${detailsDay.monthLabel}`)}
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
            <span className="eyebrow">{t("Получение подписки")}</span>
            <h2>{t("Как вы хотите получать еду?")}</h2>
            <div className="fulfillment-switch">
              <button type="button" className={fulfillmentChoice === "PICKUP" ? "selected" : ""} onClick={() => setFulfillmentChoice("PICKUP")}>{t("Самовывоз")}</button>
              <button type="button" className={fulfillmentChoice === "DELIVERY" ? "selected" : ""} onClick={() => setFulfillmentChoice("DELIVERY")}>{t("Доставка")}</button>
            </div>
            <label>{t("Пункт выдачи ")}{fulfillmentChoice === "DELIVERY" ? t("(откуда будет доставка)") : t("(где забирать)")}
              <select value={chosenPickupPoint} onChange={(event) => setChosenPickupPoint(event.target.value)}>
                {pickupPoints.map((point) => <option key={point.code} value={point.code}>{t(point.shortName)} — {t(point.address)}</option>)}
              </select>
            </label>
            <div className="package-preview">
              <span>{selected.length} {t("дней")}</span><b>·</b><span>{fulfillmentChoice === "PICKUP" ? t("Самовывоз") : t("Доставка")}</span><strong>{total.toLocaleString(locale)} ฿</strong>
            </div>
            <button type="button" disabled={!catalogReady||!chosenPickupPoint} onClick={saveDraftAndOpenAccount}>{t("Оформить подписку")}</button>
          </div>
        </div>
      )}

      {duplicateOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="payment-modal duplicate-confirm-modal">
            <span className="eyebrow">{t("Повторная подписка")}</span><h2>{t("Оформить ещё одну?")}</h2>
            <p>{t("У вас уже есть активная подписка на те же даты. Вы уверены, что хотите оформить ещё одну подписку на этот период?")}</p>
            <div className="duplicate-confirm-actions">
              <button type="button" className="confirm-yes" onClick={() => openFulfillmentChoice(true)}>{t("Да, продолжить")}</button>
              <button type="button" className="confirm-no" onClick={() => setDuplicateOpen(false)}>{t("Нет, выбрать другие даты")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
