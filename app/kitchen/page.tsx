"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type KitchenDay = {
  date: string;
  meal: {
    title: string;
    description: string;
    image: string;
  };
  totalMeals: number;
};

type DeliveryRow = {
  pickupPointName: string;
  counts: Record<string, number>;
};

type KitchenPlan = {
  generatedAt: string;
  testMode?: boolean;
  startDate: string;
  endDate: string;
  days: KitchenDay[];
  delivery: DeliveryRow[];
};

const SESSION_KEY = "mealpoint_kitchen_login";

function formatDay(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" }).format(date);
  const calendarDate = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(date);
  return `${weekday}, ${calendarDate}`;
}

export default function KitchenPage() {
  const [username, setUsername] = useState("kitchen");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<KitchenPlan | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadPlan(event?: FormEvent, credentials?: { username: string; password: string }) {
    event?.preventDefault();
    const nextUsername = credentials?.username ?? username;
    const nextPassword = credentials?.password ?? password;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/kitchen/weekly", {
        headers: {
          "x-kitchen-username": nextUsername,
          "x-kitchen-password": nextPassword
        },
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось открыть кухню");
      setPlan(data as KitchenPlan);
      setAuthorized(true);
      setUsername(nextUsername);
      setPassword(nextPassword);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username: nextUsername, password: nextPassword }));
    } catch (loadError) {
      setAuthorized(false);
      setPlan(null);
      setError(loadError instanceof Error ? loadError.message : "Не удалось открыть кухню");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { username?: string; password?: string };
      if (parsed.username && parsed.password) {
        void loadPlan(undefined, { username: parsed.username, password: parsed.password });
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authorized) return;
    const timer = window.setInterval(() => void loadPlan(), 60_000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, username, password]);

  const totals = useMemo(() => {
    if (!plan) return { week: 0, byDate: {} as Record<string, number> };
    const byDate = Object.fromEntries(plan.days.map((day) => [day.date, day.totalMeals]));
    return { week: plan.days.reduce((sum, day) => sum + day.totalMeals, 0), byDate };
  }, [plan]);

  if (!authorized || !plan) {
    return (
      <main className="page-shell kitchen-page">
        <form className="manager-login kitchen-login" onSubmit={(event) => void loadPlan(event)}>
          <span className="eyebrow">MealPoint Kitchen</span>
          <h1>Вход на кухню</h1>
          <p>Введите логин и пароль кухонного кабинета.</p>
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Логин" autoComplete="username" required />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" autoComplete="current-password" required />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "Проверяем…" : "Открыть кухню"}</button>
          <Link className="kitchen-back-link" href="/">Вернуться на сайт</Link>
        </form>
      </main>
    );
  }

  return (
    <main className="page-shell kitchen-page">
      <section className="manager-heading kitchen-heading">
        <div>
          <span className="eyebrow">MealPoint Kitchen</span>
          <h1>План на 7 дней</h1>
          <p>Паузы уже вычтены из приготовления и развозки. Всего на неделю: <b>{totals.week}</b> обедов.</p>
        </div>
        <div className="manager-heading-actions">
          <Link className="manager-scanner-link" href="/manager">К менеджеру</Link>
          <button type="button" disabled={loading} onClick={() => void loadPlan()}>{loading ? "Обновляем…" : "Обновить"}</button>
          <button type="button" className="kitchen-logout" onClick={() => {
            sessionStorage.removeItem(SESSION_KEY);
            setAuthorized(false);
            setPlan(null);
            setPassword("");
          }}>Выйти</button>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}
      {plan.testMode && <p className="test-mode-banner">Тестовый режим включён. План построен от даты {formatDay(plan.startDate)}.</p>}

      <section className="kitchen-section-card">
        <div className="kitchen-section-title">
          <div>
            <span className="eyebrow">Приготовление</span>
            <h2>Блюда и количество порций</h2>
          </div>
          <small>Автообновление каждую минуту</small>
        </div>
        <div className="kitchen-table-wrap">
          <table className="kitchen-week-table">
            <thead>
              <tr>
                <th>Показатель</th>
                {plan.days.map((day) => <th key={day.date}>{formatDay(day.date)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="kitchen-meal-row">
                <th>Блюдо</th>
                {plan.days.map((day) => (
                  <td key={day.date}>
                    <img src={day.meal.image} alt="" />
                    <strong>{day.meal.title}</strong>
                    <small>{day.meal.description}</small>
                  </td>
                ))}
              </tr>
              <tr className="kitchen-total-row">
                <th>Приготовить</th>
                {plan.days.map((day) => <td key={day.date}><b>{day.totalMeals}</b><span>обедов</span></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="kitchen-section-card">
        <div className="kitchen-section-title">
          <div>
            <span className="eyebrow">Доставка по ПВ</span>
            <h2>Сколько обедов отвезти</h2>
          </div>
        </div>
        <div className="kitchen-table-wrap">
          <table className="kitchen-delivery-table">
            <thead>
              <tr>
                <th>Пункт выдачи</th>
                {plan.days.map((day) => <th key={day.date}>{formatDay(day.date)}</th>)}
              </tr>
            </thead>
            <tbody>
              {plan.delivery.map((row) => (
                <tr key={row.pickupPointName}>
                  <th>{row.pickupPointName}</th>
                  {plan.days.map((day) => <td key={day.date}>{row.counts[day.date] || 0}</td>)}
                </tr>
              ))}
              {!plan.delivery.length && (
                <tr><td colSpan={8} className="empty-table">На ближайшие 7 дней активных подписок пока нет.</td></tr>
              )}
              <tr className="kitchen-delivery-total">
                <th>Всего</th>
                {plan.days.map((day) => <td key={day.date}>{totals.byDate[day.date] || 0}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
