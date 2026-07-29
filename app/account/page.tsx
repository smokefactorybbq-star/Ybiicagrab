"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import QuestionLink from "../../components/QuestionLink";

type AccountProfile = {
  fullName: string;
  phone: string;
};

type SubscriptionDraft = {
  dates: string[];
  selectedDays: number;
  rate: number;
  total: number;
  createdAt: string;
};

type SubscriptionDay = {
  service_date: string;
  status: string;
};

type Subscription = {
  id: string;
  code: string | null;
  status: string;
  selected_days: number;
  remaining_portions: number;
  pause_limit: number;
  pauses_used: number;
  rate_thb: number;
  total_thb: number;
  starts_on: string;
  ends_on: string;
  pickup_point_name: string | null;
  payment_method: string | null;
  paid_at: string | null;
  activated_at: string | null;
  full_name: string;
  phone: string | null;
  qrEnabled: boolean;
  days: SubscriptionDay[];
};

type Credentials = {
  id: string;
  accessToken: string;
};

const pickupPoints = [
  "Chalong Meal Point",
  "Rawai Meal Point",
  "Phuket Town Meal Point",
  "Patong Meal Point",
  "Bang Tao Meal Point"
];

const paymentOptions = [
  { id: "PROMPTPAY", title: "PromptPay / Thai bank", text: "Заглушка для оплаты по QR PromptPay" },
  { id: "TRUEMONEY", title: "TrueMoney", text: "Заглушка для перевода на TrueMoney" },
  { id: "CRYPTO", title: "Криптообмен", text: "Заглушка будущего криптообменного сервиса" }
];

const statusLabels: Record<string, string> = {
  PENDING_PAYMENT: "Ожидает оплаты",
  AWAITING_ACTIVATION: "Оплата проверяется",
  ACTIVE: "Активна",
  PAUSED: "Приостановлена",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
  PLANNED: "Запланировано",
  PAUSE_REQUESTED: "Пауза запрошена",
  PAUSED_DAY: "Пауза",
  AVAILABLE: "Можно получить",
  REDEEMED: "Получено",
  MISSED: "Пропущено"
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

export default function AccountPage() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginPhone, setLoginPhone] = useState("+66");
  const [draft, setDraft] = useState<SubscriptionDraft | null>(null);
  const [pickupPoint, setPickupPoint] = useState(pickupPoints[0]);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(paymentOptions[0].id);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [pauseLoading, setPauseLoading] = useState("");
  const [error, setError] = useState("");
  const [activeHistory, setActiveHistory] = useState<"subscription" | "delivery">("subscription");

  useEffect(() => {
    const savedProfile = readJson<AccountProfile>("mealpoint_account_profile");
    const savedDraft = readJson<SubscriptionDraft>("mealpoint_subscription_draft");
    const savedCredentials = readJson<Credentials>("mealpoint_subscription_credentials");
    setProfile(savedProfile);
    setDraft(savedDraft);
    setCredentials(savedCredentials);
    if (savedProfile) {
      setLoginName(savedProfile.fullName);
      setLoginPhone(savedProfile.phone);
    }
    setReady(true);
  }, []);

  const loadSubscription = useCallback(async (silent = false) => {
    if (!credentials) return;
    if (!silent) setError("");

    try {
      const response = await fetch(
        `/api/subscriptions?id=${encodeURIComponent(credentials.id)}&accessToken=${encodeURIComponent(credentials.accessToken)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось загрузить подписку");
      setSubscription(data.subscription as Subscription);
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
    }
  }, [credentials]);

  useEffect(() => {
    if (!credentials) return;
    void loadSubscription();
  }, [credentials, loadSubscription]);

  useEffect(() => {
    if (!credentials || subscription?.status !== "AWAITING_ACTIVATION") return;
    const timer = window.setInterval(() => void loadSubscription(true), 5000);
    return () => window.clearInterval(timer);
  }, [credentials, subscription?.status, loadSubscription]);

  const progress = useMemo(() => {
    if (!subscription?.selected_days) return 0;
    return Math.round((subscription.remaining_portions / subscription.selected_days) * 100);
  }, [subscription]);

  const qrUrl = useMemo(() => {
    if (!subscription?.qrEnabled || !subscription.code || !credentials) return "";
    const params = new URLSearchParams({
      id: credentials.id,
      accessToken: credentials.accessToken
    });
    return `/api/subscriptions/qr?${params.toString()}`;
  }, [subscription?.qrEnabled, subscription?.code, credentials]);

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProfile = { fullName: loginName.trim(), phone: loginPhone.trim() };
    localStorage.setItem("mealpoint_account_profile", JSON.stringify(nextProfile));
    setProfile(nextProfile);
    setError("");
  }

  function logout() {
    localStorage.removeItem("mealpoint_account_profile");
    setProfile(null);
  }

  async function confirmPayment() {
    if (!profile || !draft) return;
    setSubmittingPayment(true);
    setError("");

    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: profile.fullName,
          phone: profile.phone,
          dates: draft.dates,
          pickupPoint,
          paymentMethod
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось отправить данные об оплате");

      const nextCredentials = {
        id: data.subscription.id as string,
        accessToken: data.subscription.accessToken as string
      };
      localStorage.setItem("mealpoint_subscription_credentials", JSON.stringify(nextCredentials));
      localStorage.removeItem("mealpoint_subscription_draft");
      setCredentials(nextCredentials);
      setDraft(null);
      setPaymentOpen(false);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Ошибка оплаты");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function requestPause(serviceDate: string) {
    if (!credentials) return;
    setPauseLoading(serviceDate);
    setError("");

    try {
      const response = await fetch("/api/subscriptions/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: credentials.id,
          accessToken: credentials.accessToken,
          serviceDate
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось запросить паузу");
      await loadSubscription();
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "Ошибка запроса паузы");
    } finally {
      setPauseLoading("");
    }
  }

  if (!ready) {
    return <main className="page-shell account-page"><section className="empty-account"><h1>Открываем личный кабинет…</h1></section></main>;
  }

  if (!profile) {
    return (
      <main className="page-shell account-page">
        <section className="account-login-shell">
          <form className="account-login-card" onSubmit={login}>
            <span className="eyebrow">Личный кабинет</span>
            <h1>Войдите, чтобы продолжить оформление</h1>
            <p>Сейчас работает временный вход по имени и телефону. Авторизацию через Telegram подключим отдельным этапом.</p>
            <label>Имя<input value={loginName} onChange={(event) => setLoginName(event.target.value)} required minLength={2} placeholder="Иван" /></label>
            <label>Телефон<input value={loginPhone} onChange={(event) => setLoginPhone(event.target.value)} required minLength={8} placeholder="+66 00 000 0000" /></label>
            <button type="submit">Войти в личный кабинет</button>
            <button className="telegram-stub" type="button" onClick={() => alert("Здесь будет вход через Telegram.")}>Войти через Telegram — заглушка</button>
            <QuestionLink />
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell account-page">
      <section className="account-top">
        <div>
          <span className="eyebrow">Личный кабинет</span>
          <h1>Здравствуйте, {profile.fullName}</h1>
          <p>{profile.phone}</p>
        </div>
        <div className="account-top-actions"><QuestionLink /><button type="button" className="text-button muted" onClick={logout}>Выйти</button></div>
      </section>

      {error && <p className="form-error account-error">{error}</p>}

      {draft && (
        <section className="purchase-card">
          <div>
            <span className="eyebrow">Выбранная подписка</span>
            <h2>{draft.selectedDays} {draft.selectedDays === 1 ? "день" : "дней"} подряд</h2>
            <p>{formatDate(draft.dates[0])} — {formatDate(draft.dates[draft.dates.length - 1])}</p>
            <div className="purchase-numbers"><strong>{draft.total.toLocaleString("ru-RU")} ฿</strong><span>{draft.rate} ฿ за обед</span></div>
          </div>
          <label>Пункт выдачи
            <select value={pickupPoint} onChange={(event) => setPickupPoint(event.target.value)}>
              {pickupPoints.map((point) => <option key={point}>{point}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setPaymentOpen(true)}>Оплатить</button>
        </section>
      )}

      {paymentOpen && draft && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Способ оплаты">
          <div className="payment-modal">
            <button className="modal-close" type="button" onClick={() => setPaymentOpen(false)} aria-label="Закрыть">×</button>
            <span className="eyebrow">Оплата подписки</span>
            <h2>Выберите способ оплаты</h2>
            <p>Платёжные страницы пока являются заглушками. Кнопка ниже передаст менеджеру информацию о покупке.</p>
            <div className="payment-options">
              {paymentOptions.map((option) => (
                <label key={option.id} className={paymentMethod === option.id ? "selected" : ""}>
                  <input type="radio" name="payment" value={option.id} checked={paymentMethod === option.id} onChange={() => setPaymentMethod(option.id)} />
                  <span><strong>{option.title}</strong><small>{option.text}</small></span>
                </label>
              ))}
            </div>
            <div className="payment-placeholder">Здесь появятся реквизиты или платёжный QR выбранного способа.</div>
            <button type="button" disabled={submittingPayment} onClick={confirmPayment}>
              {submittingPayment ? "Передаём менеджеру…" : `Я оплатил ${draft.total.toLocaleString("ru-RU")} ฿`}
            </button>
          </div>
        </div>
      )}

      {subscription && (
        <>
          <section className={`active-subscription-card ${subscription.status === "ACTIVE" ? "is-active" : "is-waiting"}`}>
            <div className="subscription-status-line" />
            <div>
              <span className="eyebrow">Активная подписка</span>
              {subscription.status === "ACTIVE" ? (
                <>
                  <h2>Подписка активирована</h2>
                  <p>В подписке осталось <strong>{subscription.remaining_portions}</strong> обедов из {subscription.selected_days}.</p>
                  <small>Код подписки: <b>{subscription.code}</b></small>
                </>
              ) : (
                <>
                  <h2>Спасибо за оплату</h2>
                  <p>В течение 15 минут ваша подписка будет активирована.</p>
                  <small>Менеджер уже получил информацию о покупке. Страница проверяет статус автоматически.</small>
                </>
              )}
            </div>
            <div className="status-badge">{statusLabels[subscription.status] || subscription.status}</div>
          </section>

          {subscription.status === "ACTIVE" && (
            <section className="account-grid">
              <article className="profile-card dark-card">
                <span className="card-label">Остаток подписки</span>
                <strong className="large-number">{subscription.remaining_portions}</strong>
                <span>обедов осталось из {subscription.selected_days}</span>
                <div className="progress"><i style={{ width: `${progress}%` }} /></div>
                <small>Действует до {formatDate(subscription.ends_on)}</small>
              </article>

              <article className="profile-card qr-card">
                <div>
                  <span className="card-label">QR для получения еды</span>
                  <p>Покажите QR на специальном устройстве в пункте выдачи. После сканирования будет списан один обед.</p>
                  <small>{subscription.pickup_point_name || "Пункт выдачи не выбран"}</small>
                  <strong className="visible-subscription-code">{subscription.code}</strong>
                </div>
                <div className="qr-box">{qrUrl ? <img src={qrUrl} alt="QR-код подписки" /> : <span>QR временно недоступен. Используйте код подписки.</span>}</div>
              </article>
            </section>
          )}

          <section className={`pause-card ${subscription.status === "ACTIVE" && subscription.pause_limit > 0 ? "pause-enabled" : "pause-disabled"}`}>
            <div>
              <span className="eyebrow">Пауза подписки</span>
              <h2>{subscription.pause_limit > 0 ? `Доступно пауз: ${Math.max(0, subscription.pause_limit - subscription.pauses_used)}` : "Пауза недоступна"}</h2>
              <p>Пауза включается от 7 дней: 7 дней — 1 пауза, 14 дней — 2, 30 дней — 3.</p>
            </div>
            <div className="pause-days">
              {subscription.days.map((day) => {
                const canPause = subscription.status === "ACTIVE"
                  && subscription.pause_limit > subscription.pauses_used
                  && ["PLANNED", "AVAILABLE"].includes(day.status);
                return (
                  <button key={day.service_date} type="button" disabled={!canPause || pauseLoading === day.service_date} onClick={() => requestPause(day.service_date)}>
                    {formatDate(day.service_date)}
                    <span>{pauseLoading === day.service_date ? "Отправляем…" : statusLabels[day.status] || day.status}</span>
                  </button>
                );
              })}
            </div>
            <small>Использовано пауз: {subscription.pauses_used} из {subscription.pause_limit}</small>
          </section>

          <section className="history-card">
            <div className="history-tabs">
              <button type="button" className={activeHistory === "subscription" ? "active" : ""} onClick={() => setActiveHistory("subscription")}>Еда по подписке</button>
              <button type="button" className={activeHistory === "delivery" ? "active" : ""} onClick={() => setActiveHistory("delivery")}>Доставка</button>
            </div>

            {activeHistory === "subscription" ? (
              <div className="history-list">
                {subscription.days.map((day) => (
                  <div key={day.service_date}>
                    <time>{formatDate(day.service_date)}</time>
                    <strong>Обед MealPoint</strong>
                    <span>{statusLabels[day.status] || day.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-history">Заказов доставки пока нет.</div>
            )}
          </section>
        </>
      )}

      {!draft && !subscription && (
        <section className="empty-account">
          <span className="eyebrow">Подписка</span>
          <h1>Вы ещё не выбрали дни</h1>
          <p>Откройте календарь и выберите последовательность, начиная с завтрашнего дня.</p>
          <Link href="/#subscription">Выбрать дни</Link>
        </section>
      )}
    </main>
  );
}
