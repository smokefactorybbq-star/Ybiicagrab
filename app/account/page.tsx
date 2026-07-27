"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const subscriptionOrders = [
  { date: "29 июля", meal: "Курица терияки с рисом", status: "Ожидает получения" },
  { date: "27 июля", meal: "Кебаб с булгуром", status: "Получено" },
  { date: "25 июля", meal: "Бефстроганов с пюре", status: "Получено" }
];

const deliveryOrders = [
  { date: "26 июля", meal: "Рёбра BBQ × 1, салат × 1", status: "Доставлено · 590 ฿" },
  { date: "19 июля", meal: "Борщ × 2, пельмени × 1", status: "Доставлено · 490 ฿" }
];

export default function AccountPage() {
  const [qr, setQr] = useState("");
  const [activeHistory, setActiveHistory] = useState<"subscription" | "delivery">("subscription");
  const [paused, setPaused] = useState<string[]>([]);
  const token = "mealpoint:subscription:MP-2026-00841:user:demo";

  useEffect(() => {
    QRCode.toDataURL(token, { width: 260, margin: 1, errorCorrectionLevel: "H" }).then(setQr).catch(console.error);
  }, []);

  function pauseDay(day: string) {
    if (paused.length >= 3 || paused.includes(day)) return;
    setPaused((current) => [...current, day]);
  }

  const history = activeHistory === "subscription" ? subscriptionOrders : deliveryOrders;

  return (
    <main className="page-shell account-page">
      <section className="account-top">
        <div>
          <span className="eyebrow">Личный кабинет</span>
          <h1>Здравствуйте, Иван</h1>
          <p>+66 00 000 0000 · вход через Telegram будет подключён на следующем этапе.</p>
        </div>
        <button className="telegram-login" type="button">Войти через Telegram</button>
      </section>

      <section className="account-grid">
        <article className="profile-card dark-card">
          <span className="card-label">Активная подписка</span>
          <strong className="large-number">18</strong>
          <span>порций осталось</span>
          <div className="progress"><i style={{ width: "60%" }} /></div>
          <small>План на месяц · действует до 28 августа</small>
        </article>

        <article className="profile-card qr-card">
          <div>
            <span className="card-label">Ваш QR для получения еды</span>
            <p>Покажите его на устройстве в пункте выдачи. После подтверждения спишется одна порция.</p>
            <small>Код подписки: MP-2026-00841</small>
          </div>
          <div className="qr-box">{qr ? <img src={qr} alt="QR-код подписки" /> : <span>Создаём QR…</span>}</div>
        </article>
      </section>

      <section className="pause-card">
        <div>
          <span className="eyebrow">Пауза подписки</span>
          <h2>Можно перенести до 3 дней</h2>
          <p>Выберите любые даты. Запрос появится у менеджера, а дни вернутся в остаток подписки.</p>
        </div>
        <div className="pause-days">
          {["30 июля", "2 августа", "7 августа", "12 августа"].map((day) => (
            <button key={day} type="button" className={paused.includes(day) ? "paused" : ""} onClick={() => pauseDay(day)}>
              {day}<span>{paused.includes(day) ? "Запрос отправлен" : "Приостановить"}</span>
            </button>
          ))}
        </div>
        <small>Использовано пауз: {paused.length} из 3</small>
      </section>

      <section className="history-card">
        <div className="history-tabs">
          <button type="button" className={activeHistory === "subscription" ? "active" : ""} onClick={() => setActiveHistory("subscription")}>Еда по подписке</button>
          <button type="button" className={activeHistory === "delivery" ? "active" : ""} onClick={() => setActiveHistory("delivery")}>Доставка</button>
        </div>
        <div className="history-list">
          {history.map((item) => (
            <div key={`${item.date}-${item.meal}`}>
              <time>{item.date}</time>
              <strong>{item.meal}</strong>
              <span>{item.status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

