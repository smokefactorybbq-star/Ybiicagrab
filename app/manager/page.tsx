"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type ManagerDay = {
  service_date: string;
  status: string;
};

type ManagerSubscription = {
  id: string;
  code: string;
  status: string;
  full_name: string;
  phone: string | null;
  pickup_point_name: string | null;
  payment_method: string | null;
  selected_days: number;
  remaining_portions: number;
  pause_limit: number;
  pauses_used: number;
  rate_thb: number;
  total_thb: number;
  paid_at: string | null;
  activated_at: string | null;
  created_at: string;
  dates: ManagerDay[];
};

const statusLabels: Record<string, string> = {
  AWAITING_ACTIVATION: "Оплачено — активировать",
  ACTIVE: "Активна",
  PENDING_PAYMENT: "Ожидает оплаты",
  PAUSED: "Приостановлена",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
  AVAILABLE: "Доступен",
  PLANNED: "Запланирован",
  REDEEMED: "Получен",
  PAUSE_REQUESTED: "Пауза",
  MISSED: "Пропущен"
};

function formatDate(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)));
}

export default function ManagerPage() {
  const [password, setPassword] = useState("");
  const [subscriptions, setSubscriptions] = useState<ManagerSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState("");
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);

  async function loadSubscriptions(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/manager/subscriptions", {
        headers: { "x-manager-password": password },
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Ошибка загрузки");
      setSubscriptions(data.subscriptions);
      setAuthorized(true);
    } catch (loadError) {
      setAuthorized(false);
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authorized) return;
    const timer = window.setInterval(() => void loadSubscriptions(), 15_000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, password]);

  async function activateSubscription(id: string) {
    setActivating(id);
    setError("");
    try {
      const response = await fetch("/api/manager/subscriptions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-manager-password": password
        },
        body: JSON.stringify({ id, action: "activate" })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Ошибка активации");
      await loadSubscriptions();
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Ошибка активации");
    } finally {
      setActivating("");
    }
  }

  if (!authorized) {
    return (
      <main className="page-shell manager-page">
        <form className="manager-login" onSubmit={(event) => void loadSubscriptions(event)}>
          <span className="eyebrow">MealPoint Manager</span>
          <h1>Вход менеджера</h1>
          <p>Пароль задаётся переменной <b>MANAGER_PASSWORD</b> в Railway.</p>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" required />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "Проверяем…" : "Открыть таблицу"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="page-shell manager-page">
      <section className="manager-heading">
        <div>
          <span className="eyebrow">MealPoint Manager</span>
          <h1>Подписки</h1>
          <p>Паузы отмечаются красным автоматически. Таблица обновляется каждые 15 секунд.</p>
        </div>
        <div className="manager-heading-actions">
          <Link className="manager-scanner-link" href="/kitchen">Открыть кухню</Link>
          <Link className="manager-scanner-link" href="/scanner">Открыть сканер</Link>
          <button type="button" onClick={() => void loadSubscriptions()} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</button>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      <section className="manager-table-wrap">
        <table className="manager-table">
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Пункт и оплата</th>
              <th>Даты</th>
              <th>Цена</th>
              <th>Статус</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((item) => (
              <tr key={item.id} className={item.status === "AWAITING_ACTIVATION" ? "needs-activation" : ""}>
                <td><strong>{item.full_name}</strong><small>{item.phone || "—"}</small>{item.status === "ACTIVE" && <small>Код: {item.code}</small>}</td>
                <td><strong>{item.pickup_point_name || "—"}</strong><small>{item.payment_method || "—"}</small></td>
                <td>
                  <details>
                    <summary>{item.selected_days} оплаченных дней</summary>
                    <div className="manager-dates">
                      {item.dates.map((day) => {
                        const paused = ["PAUSED", "PAUSE_REQUESTED"].includes(day.status);
                        return (
                          <span key={`${item.id}:${day.service_date}`} className={paused ? "manager-date-paused" : ""} title={statusLabels[day.status] || day.status}>
                            {formatDate(day.service_date)}{paused ? " · ПАУЗА" : ""}
                          </span>
                        );
                      })}
                    </div>
                  </details>
                </td>
                <td><strong>{item.total_thb.toLocaleString("ru-RU")} ฿</strong><small>{item.rate_thb} ฿/день</small></td>
                <td><span className={`status-pill status-${item.status.toLowerCase()}`}>{statusLabels[item.status] || item.status}</span><small>Пауз: {item.pauses_used}/{item.pause_limit}</small><small>Осталось: {item.remaining_portions}</small></td>
                <td>
                  {item.status === "AWAITING_ACTIVATION" ? (
                    <button className="activate-button" type="button" disabled={activating === item.id} onClick={() => void activateSubscription(item.id)}>
                      {activating === item.id ? "Активируем…" : "Активировать"}
                    </button>
                  ) : <span className="manager-done">Готово</span>}
                </td>
              </tr>
            ))}
            {!subscriptions.length && (
              <tr><td colSpan={6} className="empty-table">Подписок пока нет.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
