"use client";

import {Translated,useLanguage} from "../../components/LanguageProvider";
import {getLocale} from "../../lib/i18n/translate";
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
  const {t,language}=useLanguage();

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
    <span className="eyebrow">MealPoint Courier</span><h1><Translated>{"Вход курьера"}</Translated></h1><p><Translated>{"Введите логин и пароль курьерского кабинета."}</Translated></p>
    <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("Логин")} autoComplete="username" required />
    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("Пароль")} autoComplete="current-password" required />
    {error && <p className="form-error"><Translated>{error}</Translated></p>}<button type="submit" disabled={loading}><Translated>{loading ? "Проверяем…" : "Открыть доставки"}</Translated></button>
    <Link className="kitchen-back-link" href="/"><Translated>{"Вернуться на сайт"}</Translated></Link>
  </form></main>;

  return <main className="page-shell kitchen-page">
    <section className="manager-heading kitchen-heading"><div><span className="eyebrow">MealPoint Courier</span><h1><Translated>{"Доставки на сегодня"}</Translated></h1><p><Translated>{data.serviceDate}</Translated> · <Translated>{data.rows.length}</Translated><Translated>{" доставок по подписке. Время доставки — 13:30–18:00."}</Translated></p></div>
      <div className="manager-heading-actions"><Link className="manager-scanner-link" href="/manager"><Translated>{"К менеджеру"}</Translated></Link><Link className="manager-scanner-link" href="/kitchen"><Translated>{"Кухня"}</Translated></Link><button type="button" onClick={() => void load()} disabled={loading}><Translated>{loading ? "Обновляем…" : "Обновить"}</Translated></button><button type="button" className="kitchen-logout" onClick={() => void logout()}><Translated>{"Выйти"}</Translated></button></div>
    </section>
    {data.testMode && <p className="test-mode-banner"><Translated>{"Включено тестовое время менеджера."}</Translated></p>}
    {error && <p className="form-error"><Translated>{error}</Translated></p>}
    <section className="kitchen-section-card"><div className="kitchen-section-title"><div><span className="eyebrow"><Translated>{"Маршрут"}</Translated></span><h2><Translated>{"Адреса и контакты"}</Translated></h2></div><small><Translated>{"Автообновление каждые 30 секунд"}</Translated></small></div>
      <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th><Translated>{"Время"}</Translated></th><th><Translated>{"Клиент"}</Translated></th><th><Translated>{"Телефон"}</Translated></th><th><Translated>{"Адрес"}</Translated></th><th><Translated>{"Подписка"}</Translated></th><th><Translated>{"Статус дня"}</Translated></th></tr></thead><tbody>
        {data.rows.map(row => <tr key={row.id}><td><strong><Translated>{row.requested_time || "—"}</Translated></strong></td><td>{row.customer_name || "—"}</td><td>{row.customer_phone ? <a href={`tel:${row.customer_phone.replace(/[^+\d]/g, "")}`}>{row.customer_phone}</a> : "—"}</td><td>{row.delivery_address || "—"}</td><td><Translated>{row.code}</Translated></td><td><Translated>{row.status}</Translated></td></tr>)}
        {!data.rows.length && <tr><td colSpan={6} className="empty-table"><Translated>{"На сегодня доставок по подписке нет."}</Translated></td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
