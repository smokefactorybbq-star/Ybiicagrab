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
  duplicateConfirmed?: boolean;
};

type Credentials = {
  id: string;
  accessToken: string;
};

type ExistingSubscription = {
  id: string;
  status: string;
  phone: string | null;
  days: Array<{ service_date: string; status: string }>;
};

const monthNames = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];
const weekdayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const CREDENTIALS_KEY = "mealpoint_subscription_credentials_v2";
const LEGACY_CREDENTIALS_KEY = "mealpoint_subscription_credentials";

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
  return Array.from({ length: 180 }, (_, index) => {
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

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function getSavedCredentials(): Credentials[] {
  const current = readJson<Credentials[]>(CREDENTIALS_KEY);
  if (Array.isArray(current)) return current;

  const legacy = readJson<Credentials>(LEGACY_CREDENTIALS_KEY);
  if (legacy?.id && legacy.accessToken) {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify([legacy]));
    return [legacy];
  }

  return [];
}

function normalizePhone(value: string | null | undefined) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function sameDates(left: string[], right: string[]) {
  return left.length === right.length && left.every((date, index) => date === right[index]);
}

export default function SubscriptionCalendar() {
  const router = useRouter();
  const days = useMemo(() => makeDays(), []);
  const [selected, setSelected] = useState<string[]>([]);
  const [packageDays, setPackageDays] = useState<7 | 14 | 30 | null>(null);
  const [packageStart, setPackageStart] = useState(days[0].id);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const rate = getRate(selected.length);
  const total = selected.length * rate;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedStartIndex = selected.length ? days.findIndex((day) => day.id === selected[0]) : -1;
  const selectedEndIndex = selected.length ? selectedStartIndex + selected.length - 1 : -1;

  function toggleDay(index: number) {
    setSelected((current) => {
      if (!current.length) {
        return index === 0 ? [days[0].id] : current;
      }

      const startIndex = days.findIndex((day) => day.id === current[0]);
      const endIndex = startIndex + current.length - 1;

      if (index === endIndex + 1 && current.length < 30) {
        return [...current, days[index].id];
      }

      if (index >= startIndex && index <= endIndex) {
        if (index === startIndex && current.length === 1) return [];
        if (index === endIndex) return current.slice(0, -1);
        return days.slice(startIndex, index + 1).map((day) => day.id);
      }

      return current;
    });
  }

  function openPackagePicker(length: 7 | 14 | 30) {
    setPackageDays(length);
    setPackageStart(days[0].id);
  }

  function applyPackage() {
    if (!packageDays) return;
    const startIndex = days.findIndex((day) => day.id === packageStart);
    if (startIndex < 0 || startIndex + packageDays > days.length) return;

    const nextDates = days.slice(startIndex, startIndex + packageDays).map((day) => day.id);
    setSelected(nextDates);
    setPackageDays(null);
    requestAnimationFrame(() => {
      document.getElementById(`meal-day-${packageStart}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start"
      });
    });
  }

  function saveDraftAndOpenAccount(duplicateConfirmed = false) {
    if (!selected.length) return;
    const draft: SubscriptionDraft = {
      dates: selected,
      selectedDays: selected.length,
      rate,
      total,
      createdAt: new Date().toISOString(),
      duplicateConfirmed
    };
    localStorage.setItem("mealpoint_subscription_draft", JSON.stringify(draft));
    router.push("/account?checkout=1");
  }

  async function goToCheckout() {
    if (!selected.length) return;
    setCheckoutError("");

    const profile = readJson<{ phone?: string }>("mealpoint_account_profile");
    const credentials = getSavedCredentials();

    if (!profile?.phone || !credentials.length) {
      saveDraftAndOpenAccount();
      return;
    }

    setCheckingDuplicate(true);
    try {
      const response = await fetch("/api/subscriptions/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось проверить подписки");

      const profilePhone = normalizePhone(profile.phone);
      const duplicate = (data.subscriptions as ExistingSubscription[]).some((subscription) => {
        if (subscription.status !== "ACTIVE") return false;
        if (normalizePhone(subscription.phone) !== profilePhone) return false;
        const subscriptionDates = subscription.days.map((day) => day.service_date);
        return sameDates(subscriptionDates, selected);
      });

      if (duplicate) {
        setDuplicateOpen(true);
      } else {
        saveDraftAndOpenAccount();
      }
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Ошибка проверки подписок");
    } finally {
      setCheckingDuplicate(false);
    }
  }

  return (
    <section id="subscription" className="subscription-section">
      <div className="section-heading split-heading">
        <div>
          <span className="eyebrow">Съедобная подписка</span>
          <h2>Целый месяц <em>неодинаковой</em> еды</h2>
          <p>Вручную подписка начинается завтра. Для пакетов на 7, 14 или 30 дней можно выбрать будущую дату начала.</p>
        </div>
        <QuestionLink />
      </div>

      <div className="calendar-actions consecutive-actions">
        <button type="button" className="text-button" onClick={() => openPackagePicker(7)}>Выбрать 7 дней</button>
        <button type="button" className="text-button" onClick={() => openPackagePicker(14)}>Выбрать 14 дней</button>
        <button type="button" className="text-button" onClick={() => openPackagePicker(30)}>Выбрать 30 дней</button>
        <button type="button" className="text-button muted" onClick={() => setSelected([])}>Сбросить</button>
        <span className="pricing-hint">1–6 дней: 350 ฿ · 7–29 дней: 300 ฿ · 30 дней: 250 ฿</span>
      </div>

      <div className="calendar-scroll" ref={scrollRef}>
        {days.map((item, index) => {
          const isSelected = selectedSet.has(item.id);
          const isNext = selected.length ? selected.length < 30 && index === selectedEndIndex + 1 : index === 0;
          const isDisabled = !isSelected && !isNext;
          return (
            <button
              id={`meal-day-${item.id}`}
              type="button"
              key={item.id}
              className={`meal-day ${isSelected ? "selected" : ""} ${isNext ? "next-available" : ""}`}
              onClick={() => toggleDay(index)}
              aria-pressed={isSelected}
              disabled={isDisabled}
              title={isDisabled ? "Выберите пакет с датой начала или добавляйте дни подряд" : undefined}
            >
              <span className="date-row">
                <strong>{item.day}</strong>
                <span>{item.monthLabel} · {item.weekday}</span>
                {isSelected && <b aria-label="Выбрано">✓</b>}
              </span>
              <img src={item.meal.image} alt="" />
              <span className="meal-tag">{item.id === days[0].id ? "Можно начать завтра" : item.meal.tag}</span>
              <span className="meal-title">{item.meal.title}</span>
              <span className="meal-description">{item.meal.description}</span>
              {isNext && selected.length > 0 && <span className="next-day-hint">Добавить следующий день</span>}
            </button>
          );
        })}
      </div>

      {checkoutError && <p className="form-error calendar-checkout-error">{checkoutError}</p>}

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
        <button type="button" disabled={!selected.length || checkingDuplicate} onClick={goToCheckout}>
          {checkingDuplicate ? "Проверяем…" : "Оформить подписку"}
        </button>
      </div>

      {packageDays && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Выбор даты начала">
          <div className="payment-modal package-date-modal">
            <button className="modal-close" type="button" onClick={() => setPackageDays(null)}>×</button>
            <span className="eyebrow">Пакет на {packageDays} дней</span>
            <h2>Выберите дату начала</h2>
            <p>Все следующие {packageDays} дней будут выбраны автоматически и пойдут подряд.</p>
            <label className="package-date-field">
              Дата первого обеда
              <input
                type="date"
                min={days[0].id}
                max={days[days.length - packageDays].id}
                value={packageStart}
                onChange={(event) => setPackageStart(event.target.value)}
              />
            </label>
            <div className="package-preview">
              <span>{packageStart}</span>
              <b>→</b>
              <span>{addDays(packageStart, packageDays - 1)}</span>
              <strong>{(packageDays * getRate(packageDays)).toLocaleString("ru-RU")} ฿</strong>
            </div>
            <button type="button" onClick={applyPackage}>Выбрать {packageDays} дней</button>
          </div>
        </div>
      )}

      {duplicateOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Подтверждение повторной подписки">
          <div className="payment-modal duplicate-confirm-modal">
            <span className="eyebrow">Повторная подписка</span>
            <h2>Оформить ещё одну?</h2>
            <p>У вас уже есть активная подписка на те же даты. Вы уверены, что хотите оформить ещё одну подписку на этот период?</p>
            <div className="duplicate-confirm-actions">
              <button type="button" className="confirm-yes" onClick={() => saveDraftAndOpenAccount(true)}>Да, перейти к оплате</button>
              <button type="button" className="confirm-no" onClick={() => setDuplicateOpen(false)}>Нет, выбрать другие даты</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
