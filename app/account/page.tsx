"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import QuestionLink from "../../components/QuestionLink";
import PickupRouteButton from "../../components/PickupRouteButton";
import { pickupPoints } from "../../data/pickupPoints";
import { getMealTemplateForDate } from "../../data/meals";
import ChatWindow from "../../components/ChatWindow";

type Account = {
  userId: string;
  fullName: string;
  phone: string;
  address: string;
  termsAcceptedAt: string | null;
};

type SubscriptionDraft = {
  dates: string[];
  selectedDays: number;
  rate: number;
  total: number;
  createdAt: string;
  duplicateConfirmed?: boolean;
};

type SubscriptionDay = { service_date: string; status: string };

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
  qrPausedToday?: boolean;
  days: SubscriptionDay[];
};

type DeliveryRequest = {
  id: string;
  subscription_id: string;
  service_date: string;
  pickup_point_name: string;
  delivery_address: string;
  delivery_type: string;
  requested_time: string | null;
  status: string;
  created_at: string;
};

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
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "Дата не указана";
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)));
}

function fallbackBangkokNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { date, hour: Number(get("hour")), minute: 0, localDateTime: `${date}T${get("hour")}:00`, isTestMode: false };
}

function sameDates(left: string[], right: string[]) {
  return left.length === right.length && left.every((date, index) => date === right[index]);
}

export default function AccountPage() {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authPhone, setAuthPhone] = useState("+66");
  const [authPassword, setAuthPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsLoading, setTermsLoading] = useState(false);

  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileSaveState, setProfileSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSavedProfile = useRef("");

  const [draft, setDraft] = useState<SubscriptionDraft | null>(null);
  const [pickupPoint, setPickupPoint] = useState(pickupPoints[0].name);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionsLoaded, setSubscriptionsLoaded] = useState(false);
  const [deliveryRequests, setDeliveryRequests] = useState<DeliveryRequest[]>([]);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [duplicatePaymentOpen, setDuplicatePaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(paymentOptions[0].id);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [pauseLoading, setPauseLoading] = useState("");
  const [pauseConfirm, setPauseConfirm] = useState<{ subscriptionId: string; serviceDate: string } | null>(null);
  const [qrSubscriptionId, setQrSubscriptionId] = useState<string | null>(null);

  const [deliverySubscription, setDeliverySubscription] = useState<Subscription | null>(null);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryName, setDeliveryName] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryType, setDeliveryType] = useState<"ASAP" | "SCHEDULED">("ASAP");
  const [deliveryTime, setDeliveryTime] = useState("13:00");
  const [deliveryLoading, setDeliveryLoading] = useState(false);

  const [clock, setClock] = useState(fallbackBangkokNowParts());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [error, setError] = useState("");

  const loadAccount = useCallback(async () => {
    try {
      const response = await fetch("/api/account/me", { cache: "no-store" });
      if (response.status === 401) {
        setAccount(null);
        setReady(true);
        return;
      }
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось открыть кабинет");
      const nextAccount = data.account as Account;
      setAccount(nextAccount);
      setProfileName(nextAccount.fullName === "Пользователь MealPoint" ? "" : nextAccount.fullName);
      setProfilePhone(nextAccount.phone);
      setProfileAddress(nextAccount.address || "");
      lastSavedProfile.current = JSON.stringify({ fullName: nextAccount.fullName, phone: nextAccount.phone, address: nextAccount.address || "" });
      if (!nextAccount.termsAcceptedAt) setTermsOpen(true);
      setReady(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось открыть кабинет");
      setReady(true);
    }
  }, []);

  const loadSubscriptions = useCallback(async (silent = false) => {
    if (!account) return;
    if (!silent) setSubscriptionsLoaded(false);
    try {
      const response = await fetch("/api/subscriptions/list", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось загрузить подписки");
      setSubscriptions(data.subscriptions as Subscription[]);
      setSubscriptionsLoaded(true);
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки подписок");
      setSubscriptionsLoaded(true);
    }
  }, [account]);

  const loadDeliveries = useCallback(async () => {
    if (!account) return;
    try {
      const response = await fetch("/api/pickup-deliveries", { cache: "no-store" });
      const data = await response.json();
      if (response.ok && data.ok) setDeliveryRequests(data.requests as DeliveryRequest[]);
    } catch {
      // История доставки не должна ломать кабинет.
    }
  }, [account]);

  const loadClock = useCallback(async () => {
    try {
      const response = await fetch("/api/app-time", { cache: "no-store" });
      const data = await response.json();
      if (response.ok && data.ok) setClock(data.clock);
    } catch { /* реальное время остаётся запасным */ }
  }, []);

  const loadChatUnread = useCallback(async () => {
    if (!account) return;
    try {
      const response = await fetch("/api/chat", { cache: "no-store" });
      const data = await response.json();
      if (response.ok && data.ok) setChatUnread(Number(data.unreadCount || 0));
    } catch { /* чат не должен ломать ЛК */ }
  }, [account]);

  useEffect(() => {
    const rawDraft = localStorage.getItem("mealpoint_subscription_draft");
    if (rawDraft) {
      try { setDraft(JSON.parse(rawDraft) as SubscriptionDraft); } catch { localStorage.removeItem("mealpoint_subscription_draft"); }
    }
    void loadAccount();
    void loadClock();
  }, [loadAccount]);

  useEffect(() => {
    if (!account) return;
    void loadSubscriptions();
    void loadDeliveries();
    void loadChatUnread();
  }, [account, loadSubscriptions, loadDeliveries, loadChatUnread]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadClock(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadClock]);

  useEffect(() => {
    if (!account) return;
    const timer = window.setInterval(() => void loadChatUnread(), 10_000);
    return () => window.clearInterval(timer);
  }, [account, loadChatUnread]);

  useEffect(() => {
    if (!account || !subscriptions.some((subscription) => subscription.status === "AWAITING_ACTIVATION")) return;
    const timer = window.setInterval(() => void loadSubscriptions(true), 5000);
    return () => window.clearInterval(timer);
  }, [account, subscriptions, loadSubscriptions]);

  useEffect(() => {
    if (!account) return;
    const payload = { fullName: profileName.trim(), phone: profilePhone.trim(), address: profileAddress.trim() };
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedProfile.current || payload.fullName.length < 2 || payload.phone.length < 8) return;

    setProfileSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/account/profile", {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось сохранить профиль");
        lastSavedProfile.current = serialized;
        setAccount(data.account as Account);
        setProfileSaveState("saved");
      } catch (saveError) {
        setProfileSaveState("error");
        setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить профиль");
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [account, profileName, profilePhone, profileAddress]);

  const hasExactActiveDuplicate = useMemo(() => {
    if (!draft) return false;
    return subscriptions.some((subscription) => subscription.status === "ACTIVE" && sameDates(subscription.days.map((day) => day.service_date), draft.dates));
  }, [draft, subscriptions]);

  const qrSubscription = useMemo(() => subscriptions.find((subscription) => subscription.id === qrSubscriptionId) || null, [qrSubscriptionId, subscriptions]);
  const qrModalUrl = qrSubscription ? `/api/subscriptions/qr?id=${encodeURIComponent(qrSubscription.id)}` : "";

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setError("");
    try {
      const endpoint = authMode === "register" ? "/api/account/register" : "/api/account/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: authPhone, password: authPassword, passwordRepeat })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Ошибка авторизации");
      const nextAccount = data.account as Account;
      setAccount(nextAccount);
      setProfileName(nextAccount.fullName === "Пользователь MealPoint" ? "" : nextAccount.fullName);
      setProfilePhone(nextAccount.phone);
      setProfileAddress(nextAccount.address || "");
      lastSavedProfile.current = JSON.stringify({ fullName: nextAccount.fullName, phone: nextAccount.phone, address: nextAccount.address || "" });
      if (!nextAccount.termsAcceptedAt) setTermsOpen(true);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Ошибка авторизации");
    } finally {
      setAuthLoading(false);
    }
  }

  async function acceptTerms() {
    if (!termsChecked) return;
    setTermsLoading(true);
    try {
      const response = await fetch("/api/account/terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accepted: true }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось принять правила");
      setAccount((current) => current ? { ...current, termsAcceptedAt: data.termsAcceptedAt } : current);
      setTermsOpen(false);
    } catch (termsError) {
      setError(termsError instanceof Error ? termsError.message : "Не удалось принять правила");
    } finally {
      setTermsLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/account/logout", { method: "POST" });
    setAccount(null);
    setSubscriptions([]);
    setQrSubscriptionId(null);
    setChatUnread(0);
    setChatOpen(false);
  }

  function openPayment() {
    if (hasExactActiveDuplicate && !draft?.duplicateConfirmed) setDuplicatePaymentOpen(true);
    else setPaymentOpen(true);
  }

  function chooseOtherDates() {
    localStorage.removeItem("mealpoint_subscription_draft");
    setDraft(null);
    setDuplicatePaymentOpen(false);
    window.location.href = "/#subscription";
  }

  async function confirmPayment() {
    if (!draft) return;
    setSubmittingPayment(true);
    setError("");
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates: draft.dates, pickupPoint, paymentMethod })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось отправить данные об оплате");
      localStorage.removeItem("mealpoint_subscription_draft");
      setDraft(null);
      setPaymentOpen(false);
      setDuplicatePaymentOpen(false);
      await loadSubscriptions();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Ошибка оплаты");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function requestPause(subscriptionId: string, serviceDate: string) {
    const loadingKey = `${subscriptionId}:${serviceDate}`;
    setPauseLoading(loadingKey);
    setError("");
    try {
      const response = await fetch("/api/subscriptions/pause", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subscriptionId, serviceDate })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось поставить подписку на паузу");
      setPauseConfirm(null);
      await loadSubscriptions();
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "Ошибка включения паузы");
    } finally {
      setPauseLoading("");
    }
  }

  function openPickupDelivery(subscription: Subscription, serviceDate: string) {
    setDeliverySubscription(subscription);
    setDeliveryDate(serviceDate);
    setDeliveryName(profileName || account?.fullName || "");
    setDeliveryPhone(profilePhone || account?.phone || "");
    setDeliveryAddress(profileAddress || account?.address || "");
    setDeliveryType("ASAP");
    setDeliveryTime("13:00");
  }

  async function submitPickupDelivery() {
    if (!deliverySubscription) return;
    setDeliveryLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pickup-deliveries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: deliverySubscription.id,
          serviceDate: deliveryDate,
          customerName: deliveryName,
          phone: deliveryPhone,
          address: deliveryAddress,
          deliveryType,
          requestedTime: deliveryType === "SCHEDULED" ? deliveryTime : null
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось оформить доставку");
      await loadDeliveries();
      setDeliverySubscription(null);
      if (data.telegramUrl) window.location.href = data.telegramUrl;
      else alert("Заявка сохранена и отправлена менеджеру. Добавьте TELEGRAM_BOT_USERNAME, чтобы открывался бот.");
    } catch (deliveryError) {
      setError(deliveryError instanceof Error ? deliveryError.message : "Ошибка доставки");
    } finally {
      setDeliveryLoading(false);
    }
  }

  if (!ready) return <main className="page-shell account-page"><section className="empty-account"><h1>Открываем личный кабинет…</h1></section></main>;

  if (!account) {
    return (
      <main className="page-shell account-page">
        <section className="account-login-shell">
          <form className="account-login-card" onSubmit={submitAuth}>
            <span className="eyebrow">Личный кабинет</span>
            <h1>{authMode === "register" ? "Создайте аккаунт" : "Войдите в MealPoint"}</h1>
            <p>Номер телефона используется как логин. Аккаунт и все подписки будут доступны на любом устройстве.</p>
            {error && <p className="form-error">{error}</p>}
            <label>Номер телефона<input value={authPhone} onChange={(event) => setAuthPhone(event.target.value)} required minLength={8} placeholder="+66 00 000 0000" autoComplete="tel" /></label>
            <label>Пароль<input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required minLength={8} autoComplete={authMode === "register" ? "new-password" : "current-password"} /></label>
            {authMode === "register" && <label>Повторить пароль<input type="password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} required minLength={8} autoComplete="new-password" /></label>}
            <button type="submit" disabled={authLoading}>{authLoading ? "Проверяем…" : authMode === "register" ? "Зарегистрироваться" : "Войти"}</button>
            <button className="auth-switch-button" type="button" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }}>
              {authMode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже зарегистрированы? Войти"}
            </button>
            <QuestionLink />
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell account-page">
      <section className="account-top">
        <div><span className="eyebrow">Личный кабинет</span><h1>Здравствуйте, {profileName || "клиент MealPoint"}</h1><p>{account.phone}</p></div>
        <div className="account-top-actions"><button type="button" className="account-message-button" aria-label="Сообщения" onClick={() => setChatOpen(true)}>✉{chatUnread > 0 && <span className="message-alert">!</span>}</button><Link className="new-subscription-link" href="/#subscription">Оформить ещё одну подписку</Link><QuestionLink /><button type="button" className="text-button muted" onClick={logout}>Выйти</button></div>
      </section>

      {clock.isTestMode && <p className="test-mode-banner">Тестовый режим: сайт считает текущим временем {formatDate(clock.date)}, {String(clock.hour).padStart(2,"0")}:{String(clock.minute || 0).padStart(2,"0")}</p>}

      {error && <p className="form-error account-error">{error}</p>}

      <section className="account-profile-form">
        <div className="account-profile-heading"><div><span className="eyebrow">Анкета клиента</span><h2>Контактные данные</h2></div><span className={`autosave-status ${profileSaveState}`}>{profileSaveState === "saving" ? "Сохраняем…" : profileSaveState === "saved" ? "Сохранено" : profileSaveState === "error" ? "Ошибка сохранения" : "Сохраняется автоматически"}</span></div>
        <div className="profile-fields-grid">
          <label>Имя<input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Иван" /></label>
          <label>Номер телефона<input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} placeholder="+66" /></label>
          <label className="profile-address-field">Адрес доставки<textarea value={profileAddress} onChange={(event) => setProfileAddress(event.target.value)} placeholder="Кондо, вилла, номер дома и ориентир" /></label>
        </div>
      </section>

      {draft && (
        <section className="purchase-card">
          <div><span className="eyebrow">Новая подписка</span><h2>{draft.selectedDays} дней подряд</h2><p>{formatDate(draft.dates[0])} — {formatDate(draft.dates[draft.dates.length - 1])}</p><div className="purchase-numbers"><strong>{draft.total.toLocaleString("ru-RU")} ฿</strong><span>{draft.rate} ฿ за обед</span></div></div>
          <div className="purchase-pickup-controls">
            <label>Пункт выдачи<select value={pickupPoint} onChange={(event) => setPickupPoint(event.target.value)}>{pickupPoints.map((point) => <option key={point.name}>{point.name}</option>)}</select></label>
            <PickupRouteButton pickupPointName={pickupPoint} />
          </div>
          <button type="button" disabled={!subscriptionsLoaded} onClick={openPayment}>{subscriptionsLoaded ? "Оплатить" : "Проверяем подписки…"}</button>
        </section>
      )}

      {subscriptions.length > 0 && (
        <section className="subscriptions-list-section">
          <div className="subscriptions-list-heading"><div><span className="eyebrow">Мои подписки</span><h2>{subscriptions.length} подписок</h2></div><p>Каждая подписка имеет собственный остаток, код и QR.</p></div>
          <div className="subscriptions-list">
            {subscriptions.map((subscription, index) => {
              const progress = subscription.selected_days ? Math.round((subscription.remaining_portions / subscription.selected_days) * 100) : 0;
              const isActive = subscription.status === "ACTIVE";
              const isWaiting = subscription.status === "AWAITING_ACTIVATION";
              return (
                <article className="subscription-instance" key={subscription.id}>
                  <section className={`active-subscription-card ${isActive ? "is-active" : "is-waiting"}`}>
                    <div className="subscription-status-line" />
                    <div>
                      <span className="eyebrow">Подписка №{subscriptions.length - index}</span>
                      {isActive ? <><h2>Подписка активирована</h2><p>{formatDate(subscription.starts_on)} — {formatDate(subscription.ends_on)}</p><p>Осталось <strong>{subscription.remaining_portions}</strong> обедов из {subscription.selected_days}.</p><small>Код подписки: <b>{subscription.code}</b></small></> : isWaiting ? <><h2>Спасибо за оплату</h2><p>{formatDate(subscription.starts_on)} — {formatDate(subscription.ends_on)}</p><p>В течение 15 минут ваша подписка будет активирована.</p></> : <><h2>{statusLabels[subscription.status] || subscription.status}</h2><p>{formatDate(subscription.starts_on)} — {formatDate(subscription.ends_on)}</p></>}
                    </div>
                    <div className="subscription-card-actions"><div className="status-badge">{statusLabels[subscription.status] || subscription.status}</div><button type="button" className="open-qr-button" disabled={!isActive || !subscription.qrEnabled} onClick={() => setQrSubscriptionId(subscription.id)}>Открыть QR</button></div>
                  </section>

                  {isActive && (
                    <details className="subscription-details" open={index === 0}>
                      <summary>Остаток, паузы и дни подписки</summary>
                      <section className="account-grid">
                        <article className="profile-card dark-card"><span className="card-label">Остаток подписки</span><strong className="large-number">{subscription.remaining_portions}</strong><span>обедов осталось из {subscription.selected_days}</span><div className="progress"><i style={{ width: `${progress}%` }} /></div><small>Действует до {formatDate(subscription.ends_on)}</small></article>
                        <article className="profile-card subscription-info-card"><span className="card-label">Данные подписки</span><strong>{subscription.code}</strong><p>{subscription.pickup_point_name || "Пункт выдачи не выбран"}</p>{subscription.pickup_point_name && <PickupRouteButton pickupPointName={subscription.pickup_point_name} label="Маршрут до ПВ" />}</article>
                      </section>

                      <section className="history-card">
                        <div className="history-tabs"><strong>Еда по этой подписке</strong></div>
                        <div className="history-list subscription-meal-history">
                          {subscription.days.map((day) => {
                            const isToday = day.service_date === clock.date;
                            const canOrderDelivery = isToday && clock.hour >= 12 && day.status === "AVAILABLE";
                            const meal = getMealTemplateForDate(day.service_date);
                            return (
                              <div key={day.service_date} className={isToday ? "today-meal-row" : ""}>
                                <time>{formatDate(day.service_date)}</time>
                                <span className="history-meal-name"><strong>{meal.title}</strong><small>{subscription.pickup_point_name}</small></span>
                                <span className="meal-day-actions">
                                  {isToday && day.status === "AVAILABLE" && clock.hour < 12 && <b className="meal-preparing-status">Готовим</b>}
                                  {canOrderDelivery && <><button type="button" className="pickup-delivery-button" onClick={() => openPickupDelivery(subscription, day.service_date)}>Заказать доставку с пункта выдачи</button><b className="meal-ready-status">Можно забирать</b></>}
                                  {(!isToday || day.status !== "AVAILABLE") && <em>{statusLabels[day.status] || day.status}</em>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section className={`pause-card ${subscription.pause_limit > 0 ? "pause-enabled" : "pause-disabled"}`}>
                        <div><span className="eyebrow">Пауза этой подписки</span><h2>{subscription.pause_limit > 0 ? `Доступно пауз: ${Math.max(0, subscription.pause_limit - subscription.pauses_used)}` : "Пауза недоступна"}</h2><p>7 дней — 1 пауза, 14 дней — 2, 30 дней — 3.</p></div>
                        <div className="pause-days">{subscription.days.map((day) => { const loadingKey = `${subscription.id}:${day.service_date}`; const canPause = subscription.pause_limit > subscription.pauses_used && ["PLANNED", "AVAILABLE"].includes(day.status); return <button key={day.service_date} className={["PAUSED", "PAUSE_REQUESTED"].includes(day.status) ? "paused-day-button" : ""} type="button" disabled={!canPause || pauseLoading === loadingKey} onClick={() => setPauseConfirm({ subscriptionId: subscription.id, serviceDate: day.service_date })}>{formatDate(day.service_date)}<span>{pauseLoading === loadingKey ? "Ставим паузу…" : statusLabels[day.status] || day.status}</span></button>; })}</div>
                        <small>Использовано пауз: {subscription.pauses_used} из {subscription.pause_limit}</small>
                      </section>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="history-card delivery-history-card">
        <div className="history-tabs"><strong>История доставки из ПВ</strong></div>
        {deliveryRequests.length ? <div className="history-list">{deliveryRequests.map((request) => <div key={request.id}><time>{formatDate(request.service_date)}</time><strong>{request.pickup_point_name}</strong><span>{request.delivery_type === "ASAP" ? "Ближайшее время" : request.requested_time} · {request.status}</span></div>)}</div> : <div className="empty-history">Заказов доставки пока нет.</div>}
      </section>

      {!draft && !subscriptions.length && <section className="empty-account"><span className="eyebrow">Подписка</span><h1>Вы ещё не выбрали дни</h1><p>Откройте календарь и выберите последовательность или пакет.</p><Link href="/#subscription">Выбрать дни</Link></section>}

      {termsOpen && (
        <div className="modal-backdrop terms-backdrop" role="dialog" aria-modal="true">
          <div className="payment-modal terms-modal">
            <span className="eyebrow">Правила и условия</span><h2>Перед использованием MealPoint</h2>
            <div className="terms-scroll">
              <p><strong>Подписка.</strong> Клиент выбирает последовательные даты, пункт выдачи и оплачивает подписку. Активация выполняется менеджером после проверки оплаты.</p>
              <p><strong>Получение.</strong> После активации QR каждой подписки появляется в личном кабинете. Один QR-скан списывает один обед за запланированный день.</p>
              <p><strong>Пауза.</strong> Пауза доступна для подписок от семи дней в пределах установленного лимита и переносит обед на новый день.</p>
              <p><strong>Доставка.</strong> Компания бесплатно доставляет обеды в выбранные пункты выдачи. Покупатель может запросить доставку из ПВ на дом. Оплату за такую доставку производит покупатель согласно тарифу Grab Taxi.</p>
              <p><strong>Контакты.</strong> Клиент обязан указывать актуальные имя, номер телефона и адрес доставки.</p>
              <Link href="/rules" target="_blank">Открыть полные правила в новой вкладке</Link>
            </div>
            <label className="terms-checkbox"><input type="checkbox" checked={termsChecked} onChange={(event) => setTermsChecked(event.target.checked)} /><span>Я ознакомился с правилами и условиями</span></label>
            <button type="button" disabled={!termsChecked || termsLoading} onClick={acceptTerms}>{termsLoading ? "Сохраняем…" : "Продолжить"}</button>
          </div>
        </div>
      )}

      {pauseConfirm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !pauseLoading) setPauseConfirm(null);
        }}>
          <section className="payment-modal pause-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="pause-confirm-title">
            <button className="modal-close" type="button" aria-label="Закрыть" disabled={Boolean(pauseLoading)} onClick={() => setPauseConfirm(null)}>×</button>
            <span className="eyebrow">Пауза подписки</span>
            <h2 id="pause-confirm-title">Подтвердите паузу</h2>
            <p>Вы уверены, что хотите поставить на паузу вашу подписку на <b>{formatDate(pauseConfirm.serviceDate)}</b>?</p>
            <div className="pause-confirm-actions">
              <button type="button" className="confirm-no" disabled={Boolean(pauseLoading)} onClick={() => setPauseConfirm(null)}>Нет</button>
              <button type="button" className="confirm-yes" disabled={Boolean(pauseLoading)} onClick={() => void requestPause(pauseConfirm.subscriptionId, pauseConfirm.serviceDate)}>
                {pauseLoading ? "Ставим на паузу…" : "Да, поставить на паузу"}
              </button>
            </div>
          </section>
        </div>
      )}

      {duplicatePaymentOpen && draft && <div className="modal-backdrop"><div className="payment-modal duplicate-confirm-modal"><span className="eyebrow">Повторная подписка</span><h2>Оформить ещё одну?</h2><p>У вас уже есть активная подписка на те же даты.</p><div className="duplicate-confirm-actions"><button type="button" className="confirm-yes" onClick={() => { setDuplicatePaymentOpen(false); setPaymentOpen(true); }}>Да, перейти к оплате</button><button type="button" className="confirm-no" onClick={chooseOtherDates}>Нет, выбрать другие даты</button></div></div></div>}

      {paymentOpen && draft && <div className="modal-backdrop"><div className="payment-modal"><button className="modal-close" type="button" onClick={() => setPaymentOpen(false)}>×</button><span className="eyebrow">Оплата подписки</span><h2>Выберите способ оплаты</h2><p>Платёжные страницы пока являются заглушками.</p><div className="payment-options">{paymentOptions.map((option) => <label key={option.id} className={paymentMethod === option.id ? "selected" : ""}><input type="radio" name="payment" value={option.id} checked={paymentMethod === option.id} onChange={() => setPaymentMethod(option.id)} /><span><strong>{option.title}</strong><small>{option.text}</small></span></label>)}</div><div className="payment-placeholder">Здесь появятся реквизиты или платёжный QR.</div><button type="button" disabled={submittingPayment} onClick={confirmPayment}>{submittingPayment ? "Передаём менеджеру…" : `Я оплатил ${draft.total.toLocaleString("ru-RU")} ฿`}</button></div></div>}

      {qrSubscription && <div className="modal-backdrop"><div className="payment-modal qr-display-modal"><button className="modal-close" type="button" onClick={() => setQrSubscriptionId(null)}>×</button><span className="eyebrow">QR этой подписки</span><h2>{qrSubscription.code}</h2><p>{formatDate(qrSubscription.starts_on)} — {formatDate(qrSubscription.ends_on)}</p><div className="qr-display-box"><img src={qrModalUrl} alt={`QR-код ${qrSubscription.code}`} /></div><button className="close-qr-button" type="button" onClick={() => setQrSubscriptionId(null)}>Закрыть QR</button></div></div>}

      {deliverySubscription && <div className="modal-backdrop"><div className="payment-modal pickup-delivery-modal"><button className="modal-close" type="button" onClick={() => setDeliverySubscription(null)}>×</button><span className="eyebrow">Доставка из ПВ</span><h2>{deliverySubscription.pickup_point_name}</h2><p>Обед за {formatDate(deliveryDate)}. Доставка оплачивается клиентом по тарифу Grab Taxi.</p><label>Имя<input value={deliveryName} onChange={(event) => setDeliveryName(event.target.value)} /></label><label>Телефон<input value={deliveryPhone} onChange={(event) => setDeliveryPhone(event.target.value)} /></label><label>Адрес доставки<textarea value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} /></label><label>Время<select value={deliveryType} onChange={(event) => setDeliveryType(event.target.value as "ASAP" | "SCHEDULED")}><option value="ASAP">Ближайшее</option><option value="SCHEDULED">Определённое время</option></select></label>{deliveryType === "SCHEDULED" && <label>Время доставки<input type="time" value={deliveryTime} onChange={(event) => setDeliveryTime(event.target.value)} /></label>}<button type="button" disabled={deliveryLoading} onClick={submitPickupDelivery}>{deliveryLoading ? "Оформляем…" : "Заказать и открыть Telegram"}</button></div></div>}
      <ChatWindow open={chatOpen} onClose={() => setChatOpen(false)} mode="CUSTOMER" title="Чат с администратором" onRead={() => setChatUnread(0)} />
    </main>
  );
}
