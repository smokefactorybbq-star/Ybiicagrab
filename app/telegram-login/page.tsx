"use client";

import { useEffect, useState } from "react";

export default function TelegramLoginBridgePage() {
  const [status, setStatus] = useState("Открываем безопасный вход MealPoint…");
  const [error, setError] = useState("");
  const [userLabel, setUserLabel] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-telegram-web-app="1"]');
    const boot = () => {
      const tg = (window as any).Telegram?.WebApp;
      if (!tg?.initData) {
        setError("Эту страницу нужно открыть из приложения Telegram через кнопку входа на meal-point.com.");
        setStatus("");
        return;
      }
      tg.ready?.();
      tg.expand?.();
      const u = tg.initDataUnsafe?.user;
      const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
      setUserLabel(u?.username ? `${name || "Telegram"} (@${u.username})` : name || `Telegram ID ${u?.id || ""}`);
      setStatus("Проверьте, что выбран нужный Telegram-аккаунт.");
      setReady(true);
    };
    if (existing) { boot(); return; }
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js?64";
    script.async = true;
    script.dataset.telegramWebApp = "1";
    script.onload = boot;
    script.onerror = () => { setError("Не удалось загрузить Telegram Mini App."); setStatus(""); };
    document.head.appendChild(script);
  }, []);

  async function approve() {
    if (!ready || busy) return;
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.initData) return;
    setBusy(true); setError(""); setStatus("Подтверждаем аккаунт…");
    try {
      const response = await fetch("/api/auth/telegram/miniapp/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось подтвердить вход");
      setStatus("Готово. Вернитесь в браузер — MealPoint откроет этот аккаунт автоматически.");
      window.setTimeout(() => tg.close?.(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось подтвердить вход");
      setStatus("");
      setBusy(false);
    }
  }

  function wrongAccount() {
    const tg = (window as any).Telegram?.WebApp;
    setStatus("Закройте это окно, переключите аккаунт в Telegram и снова нажмите «Войти через Telegram» на сайте MealPoint.");
    window.setTimeout(() => tg?.close?.(), 800);
  }

  return <main className="page-shell account-page">
    <section className="account-login-shell">
      <div className="account-login-card telegram-bridge-card">
        <span className="eyebrow">MealPoint · безопасный вход</span>
        <h1>Выберите Telegram-аккаунт</h1>
        {userLabel && <div className="telegram-current-account"><span>Сейчас выбран</span><strong>{userLabel}</strong></div>}
        {status && <p>{status}</p>}
        {error && <p className="form-error">{error}</p>}
        {ready && !error && <>
          <button type="button" className="telegram-entry-button" disabled={busy} onClick={approve}>{busy ? "Подтверждаем…" : "Войти этим аккаунтом"}</button>
          <button type="button" className="text-button telegram-switch-account-button" disabled={busy} onClick={wrongAccount}>Это не мой аккаунт</button>
        </>}
      </div>
    </section>
  </main>;
}
