"use client";

import { FormEvent, useState } from "react";

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
  dates: string[];
};

const statusLabels: Record<string, string> = {
  AWAITING_ACTIVATION: "Оплачено — активировать",
  ACTIVE: "Активна",
  PENDING_PAYMENT: "Ожидает оплаты",
  PAUSED: "Приостановлена",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена"
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
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
        <form className="manager-login" onSubmit={loadSubscriptions}>
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
          <p>Оплаченные подписки, ожидающие активации, показываются первыми.</p>
        </div>
        <button type="button" onClick={() => loadSubscriptions()} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</button>
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
                <td><details><summary>{item.selected_days} дней подряд</summary><div className="manager-dates">{item.dates.map((date) => <span key={date}>{formatDate(date)}</span>)}</div></details></td>
                <td><strong>{item.total_thb.toLocaleString("ru-RU")} ฿</strong><small>{item.rate_thb} ฿/день</small></td>
                <td><span className={`status-pill status-${item.status.toLowerCase()}`}>{statusLabels[item.status] || item.status}</span><small>Пауз: {item.pauses_used}/{item.pause_limit}</small></td>
                <td>
                  {item.status === "AWAITING_ACTIVATION" ? (
                    <button className="activate-button" type="button" disabled={activating === item.id} onClick={() => activateSubscription(item.id)}>
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
