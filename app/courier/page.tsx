"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type CourierRow = {
  id: string;
  subscription_id: string;
  code: string;
  service_date: string;
  requested_time: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  status: string;
  meal_title: string | null;
  meal_description: string | null;
};

type CourierData = { serviceDate: string; testMode?: boolean; rows: CourierRow[] };

export default function CourierPage() {
  const [username, setUsername] = useState("courier");
  const [password, setPassword] = useState("");
  const [data, setData] = useState<CourierData | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (event) {
        const loginResponse = await fetch("/api/staff/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ role: "COURIER", username, password })
        });
        const loginData = await loginResponse.json();
        if (!loginResponse.ok || !loginData.ok) throw new Error(loginData.error || "Неверный логин или пароль");
        setPassword("");
      }

      const response = await fetch("/api/courier/today", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Не удалось открыть кабинет курьера");
      setData(payload);
      setAuthorized(true);
    } catch (e) {
      setAuthorized(false);
      setData(null);
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/staff/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    setAuthorized(false);
    setData(null);
    setPassword("");
  }

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authorized) return;
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  if (!authorized || !data) return <main className="page-shell kitchen-page"><form className="manager-login kitchen-login" onSubmit={(e) => void load(e)}>
    <span className="eyebrow">MealPoint Courier</span><h1>Вход курьера</h1><p>Введите логин и пароль курьерского кабинета.</p>
    <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Логин" autoComplete="username" required />
    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" autoComplete="current-password" required />
    {error && <p className="form-error">{error}</p>}<button type="submit" disabled={loading}>{loading ? "Проверяем…" : "Открыть доставки"}</button>
    <Link className="kitchen-back-link" href="/">Вернуться на сайт</Link>
  </form></main>;

  return <main className="page-shell kitchen-page">
    <section className="manager-heading kitchen-heading"><div><span className="eyebrow">MealPoint Courier</span><h1>Доставки на сегодня</h1><p>{data.serviceDate} · {data.rows.length} доставок по подписке. Время доставки — 12:00–18:00.</p></div>
      <div className="manager-heading-actions"><Link className="manager-scanner-link" href="/manager">К менеджеру</Link><Link className="manager-scanner-link" href="/kitchen">Кухня</Link><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</button><button type="button" className="kitchen-logout" onClick={() => void logout()}>Выйти</button></div>
    </section>
    {data.testMode && <p className="test-mode-banner">Включено тестовое время менеджера.</p>}
    {error && <p className="form-error">{error}</p>}
    <section className="kitchen-section-card"><div className="kitchen-section-title"><div><span className="eyebrow">Маршрут</span><h2>Адреса и контакты</h2></div><small>Автообновление каждые 30 секунд</small></div>
      <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Время</th><th>Клиент</th><th>Телефон</th><th>Адрес</th><th>Подписка</th><th>Статус дня</th></tr></thead><tbody>
        {data.rows.map(row => <tr key={row.id}><td><strong>{row.requested_time || "—"}</strong></td><td>{row.customer_name || "—"}</td><td>{row.customer_phone ? <a href={`tel:${row.customer_phone.replace(/[^+\d]/g, "")}`}>{row.customer_phone}</a> : "—"}</td><td>{row.delivery_address || "—"}</td><td>{row.code}</td><td>{row.status}</td></tr>)}
        {!data.rows.length && <tr><td colSpan={6} className="empty-table">На сегодня доставок по подписке нет.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
