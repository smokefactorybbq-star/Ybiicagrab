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
  duplicateConfirmed?: boolean;
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
  qrPausedToday?: boolean;
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

const CREDENTIALS_KEY = "mealpoint_subscription_credentials_v2";
const LEGACY_CREDENTIALS_KEY = "mealpoint_subscription_credentials";

function formatDate(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "Дата не указана";

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function normalizePhone(value: string | null | undefined) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function sameDates(left: string[], right: string[]) {
  return left.length === right.length && left.every((date, index) => date === right[index]);
}

function draftMatchesActiveSubscription(draft: SubscriptionDraft, subscriptions: Subscription[]) {
  return subscriptions.some((subscription) => {
    if (subscription.status !== "ACTIVE") return false;
    return sameDates(subscription.days.map((day) => day.service_date), draft.dates);
  });
}

function uniqueCredentials(items: Credentials[]) {
  const map = new Map<string, Credentials>();
  for (const item of items) {
    if (item?.id && item?.accessToken) map.set(item.id, item);
  }
  return [...map.values()];
}

function getSavedCredentials() {
  const current = readJson<Credentials[]>(CREDENTIALS_KEY);
  const legacy = readJson<Credentials>(LEGACY_CREDENTIALS_KEY);
  const merged = uniqueCredentials([
    ...(Array.isArray(current) ? current : []),
    ...(legacy?.id && legacy.accessToken ? [legacy] : [])
  ]);
  if (merged.length) localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(merged));
  return merged;
}

export default function AccountPage() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginPhone, setLoginPhone] = useState("+66");
  const [draft, setDraft] = useState<SubscriptionDraft | null>(null);
  const [pickupPoint, setPickupPoint] = useState(pickupPoints[0]);
  const [credentials, setCredentials] = useState<Credentials[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionsLoaded, setSubscriptionsLoaded] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [duplicatePaymentOpen, setDuplicatePaymentOpen] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(paymentOptions[0].id);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [pauseLoading, setPauseLoading] = useState("");
  const [error, setError] = useState("");
  const [qrSubscriptionId, setQrSubscriptionId] = useState<string | null>(null);

  useEffect(() => {
    const savedProfile = readJson<AccountProfile>("mealpoint_account_profile");
    const savedDraft = readJson<SubscriptionDraft>("mealpoint_subscription_draft");
    setProfile(savedProfile);
    setDraft(savedDraft);
    setDuplicateConfirmed(Boolean(savedDraft?.duplicateConfirmed));
    setCredentials(getSavedCredentials());
    if (savedProfile) {
      setLoginName(savedProfile.fullName);
      setLoginPhone(savedProfile.phone);
    }
    setReady(true);
  }, []);

  const loadSubscriptions = useCallback(async (silent = false): Promise<Subscription[] | null> => {
    if (!profile || !credentials.length) {
      setSubscriptions([]);
      setSubscriptionsLoaded(true);
      return [];
    }
    if (!silent) {
      setError("");
      setSubscriptionsLoaded(false);
    }

    try {
      const response = await fetch("/api/subscriptions/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials }),
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось загрузить подписки");

      const profilePhone = normalizePhone(profile.phone);
      const ownSubscriptions = (data.subscriptions as Subscription[]).filter(
        (subscription) => normalizePhone(subscription.phone) === profilePhone
      );
      setSubscriptions(ownSubscriptions);
      setSubscriptionsLoaded(true);
      return ownSubscriptions;
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
      setSubscriptionsLoaded(true);
      return null;
    }
  }, [credentials, profile]);

  useEffect(() => {
    if (!ready || !profile) return;
    void loadSubscriptions();
  }, [ready, profile, loadSubscriptions]);

  useEffect(() => {
    if (!profile || !subscriptions.some((subscription) => subscription.status === "AWAITING_ACTIVATION")) return;
    const timer = window.setInterval(() => void loadSubscriptions(true), 5000);
    return () => window.clearInterval(timer);
  }, [profile, subscriptions, loadSubscriptions]);

  const hasExactActiveDuplicate = useMemo(() => {
    if (!draft) return false;
    return draftMatchesActiveSubscription(draft, subscriptions);
  }, [draft, subscriptions]);

  const qrSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.id === qrSubscriptionId) || null,
    [qrSubscriptionId, subscriptions]
  );

  const qrModalUrl = qrSubscription ? getQrUrl(qrSubscription) : "";

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
    setSubscriptions([]);
    setQrSubscriptionId(null);
  }

  async function openPayment() {
    let duplicate = hasExactActiveDuplicate;

    if (draft && credentials.length && !subscriptionsLoaded) {
      const loadedSubscriptions = await loadSubscriptions();
      if (loadedSubscriptions === null) return;
      duplicate = draftMatchesActiveSubscription(draft, loadedSubscriptions);
    }

    if (duplicate && !duplicateConfirmed) {
      setDuplicatePaymentOpen(true);
      return;
    }
    setPaymentOpen(true);
  }

  function chooseOtherDates() {
    localStorage.removeItem("mealpoint_subscription_draft");
    setDraft(null);
    setDuplicatePaymentOpen(false);
    window.location.href = "/#subscription";
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
      const updatedCredentials = uniqueCredentials([nextCredentials, ...credentials]);
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(updatedCredentials));
      localStorage.setItem(LEGACY_CREDENTIALS_KEY, JSON.stringify(nextCredentials));
      localStorage.removeItem("mealpoint_subscription_draft");
      setCredentials(updatedCredentials);
      setDraft(null);
      setPaymentOpen(false);
      setDuplicatePaymentOpen(false);
      setDuplicateConfirmed(false);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Ошибка оплаты");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function requestPause(subscriptionId: string, serviceDate: string) {
    const subscriptionCredentials = credentials.find((item) => item.id === subscriptionId);
    if (!subscriptionCredentials) return;

    const loadingKey = `${subscriptionId}:${serviceDate}`;
    setPauseLoading(loadingKey);
    setError("");

    try {
      const response = await fetch("/api/subscriptions/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: subscriptionCredentials.id,
          accessToken: subscriptionCredentials.accessToken,
          serviceDate
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось поставить подписку на паузу");
      await loadSubscriptions();
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "Ошибка включения паузы");
    } finally {
      setPauseLoading("");
    }
  }

  function getQrUrl(subscription: Subscription) {
    const subscriptionCredentials = credentials.find((item) => item.id === subscription.id);
    if (!subscription.qrEnabled || !subscription.code || !subscriptionCredentials) return "";
    const params = new URLSearchParams({
      id: subscriptionCredentials.id,
      accessToken: subscriptionCredentials.accessToken
    });
    return `/api/subscriptions/qr?${params.toString()}`;
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
        <div className="account-top-actions">
          <Link className="new-subscription-link" href="/#subscription">Оформить ещё одну подписку</Link>
          <QuestionLink />
          <button type="button" className="text-button muted" onClick={logout}>Выйти</button>
        </div>
      </section>

      {error && <p className="form-error account-error">{error}</p>}

      {draft && (
        <section className="purchase-card">
          <div>
            <span className="eyebrow">Новая подписка</span>
            <h2>{draft.selectedDays} {draft.selectedDays === 1 ? "день" : "дней"} подряд</h2>
            <p>{formatDate(draft.dates[0])} — {formatDate(draft.dates[draft.dates.length - 1])}</p>
            <div className="purchase-numbers"><strong>{draft.total.toLocaleString("ru-RU")} ฿</strong><span>{draft.rate} ฿ за обед</span></div>
          </div>
          <label>Пункт выдачи
            <select value={pickupPoint} onChange={(event) => setPickupPoint(event.target.value)}>
              {pickupPoints.map((point) => <option key={point}>{point}</option>)}
            </select>
          </label>
          <button type="button" disabled={Boolean(credentials.length) && !subscriptionsLoaded} onClick={() => void openPayment()}>{Boolean(credentials.length) && !subscriptionsLoaded ? "Проверяем подписки…" : "Оплатить"}</button>
        </section>
      )}

      {duplicatePaymentOpen && draft && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Подтверждение повторной подписки">
          <div className="payment-modal duplicate-confirm-modal">
            <span className="eyebrow">Повторная подписка</span>
            <h2>Оформить ещё одну?</h2>
            <p>У вас уже есть активная подписка на те же даты. Вы уверены, что хотите оформить ещё одну подписку на этот период?</p>
            <div className="duplicate-confirm-actions">
              <button type="button" className="confirm-yes" onClick={() => { setDuplicateConfirmed(true); setDuplicatePaymentOpen(false); setPaymentOpen(true); }}>Да, перейти к оплате</button>
              <button type="button" className="confirm-no" onClick={chooseOtherDates}>Нет, выбрать другие даты</button>
            </div>
          </div>
        </div>
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

      {qrSubscription && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`QR-код подписки ${qrSubscription.code || ""}`}>
          <div className="payment-modal qr-display-modal">
            <button className="modal-close" type="button" onClick={() => setQrSubscriptionId(null)} aria-label="Закрыть QR">×</button>
            <span className="eyebrow">QR этой подписки</span>
            <h2>{qrSubscription.code || "Подписка"}</h2>
            <p>{formatDate(qrSubscription.starts_on)} — {formatDate(qrSubscription.ends_on)}</p>
            <div className="qr-display-box">
              {qrModalUrl ? (
                <img src={qrModalUrl} alt={`QR-код подписки ${qrSubscription.code || ""}`} />
              ) : (
                <span>QR-код временно недоступен.</span>
              )}
            </div>
            <p className="qr-display-note">Покажите этот QR на пункте выдачи. Списание произойдёт только с подписки <strong>{qrSubscription.code}</strong>.</p>
            <button className="close-qr-button" type="button" onClick={() => setQrSubscriptionId(null)}>Закрыть QR</button>
          </div>
        </div>
      )}

      {subscriptions.length > 0 && (
        <section className="subscriptions-list-section">
          <div className="subscriptions-list-heading">
            <div>
              <span className="eyebrow">Мои подписки</span>
              <h2>{subscriptions.length} {subscriptions.length === 1 ? "подписка" : "подписки"}</h2>
            </div>
            <p>Количество подписок не ограничено. Каждая подписка имеет собственный остаток, код и QR.</p>
          </div>

          <div className="subscriptions-list">
            {subscriptions.map((subscription, index) => {
              const progress = subscription.selected_days
                ? Math.round((subscription.remaining_portions / subscription.selected_days) * 100)
                : 0;
              const qrUrl = getQrUrl(subscription);
              const isActive = subscription.status === "ACTIVE";
              const isWaiting = subscription.status === "AWAITING_ACTIVATION";

              return (
                <article className="subscription-instance" key={subscription.id}>
                  <section className={`active-subscription-card ${isActive ? "is-active" : "is-waiting"}`}>
                    <div className="subscription-status-line" />
                    <div>
                      <span className="eyebrow">Подписка №{subscriptions.length - index}</span>
                      {isActive ? (
                        <>
                          <h2>Подписка активирована</h2>
                          <p>{formatDate(subscription.starts_on)} — {formatDate(subscription.ends_on)}</p>
                          <p>Осталось <strong>{subscription.remaining_portions}</strong> обедов из {subscription.selected_days}.</p>
                          <small>Код подписки: <b>{subscription.code}</b></small>
                        </>
                      ) : isWaiting ? (
                        <>
                          <h2>Спасибо за оплату</h2>
                          <p>{formatDate(subscription.starts_on)} — {formatDate(subscription.ends_on)}</p>
                          <p>В течение 15 минут ваша подписка будет активирована.</p>
                          <small>Менеджер уже получил информацию о покупке. Страница проверяет статус автоматически.</small>
                        </>
                      ) : (
                        <>
                          <h2>{statusLabels[subscription.status] || subscription.status}</h2>
                          <p>{formatDate(subscription.starts_on)} — {formatDate(subscription.ends_on)}</p>
                          <small>{subscription.selected_days} обедов · {subscription.total_thb.toLocaleString("ru-RU")} ฿</small>
                        </>
                      )}
                    </div>
                    <div className="subscription-card-actions">
                      <div className="status-badge">{statusLabels[subscription.status] || subscription.status}</div>
                      <button
                        type="button"
                        className="open-qr-button"
                        disabled={!isActive || !qrUrl}
                        onClick={() => setQrSubscriptionId(subscription.id)}
                        title={subscription.qrPausedToday ? "Сегодня подписка поставлена на паузу" : isActive ? "Открыть QR этой подписки" : "QR появится после активации менеджером"}
                      >
                        Открыть QR
                      </button>
                    </div>
                  </section>

                  {isActive && (
                    <details className="subscription-details" open={index === 0}>
                      <summary>Остаток, паузы и дни подписки</summary>

                      <section className="account-grid">
                        <article className="profile-card dark-card">
                          <span className="card-label">Остаток подписки</span>
                          <strong className="large-number">{subscription.remaining_portions}</strong>
                          <span>обедов осталось из {subscription.selected_days}</span>
                          <div className="progress"><i style={{ width: `${progress}%` }} /></div>
                          <small>Действует до {formatDate(subscription.ends_on)}</small>
                        </article>

                        <article className="profile-card subscription-info-card">
                          <span className="card-label">Данные подписки</span>
                          <strong>{subscription.code}</strong>
                          <p>{subscription.pickup_point_name || "Пункт выдачи не выбран"}</p>
                          <small>QR этой подписки открывается отдельной кнопкой в зелёном блоке выше.</small>
                        </article>
                      </section>

                      <section className={`pause-card ${subscription.pause_limit > 0 ? "pause-enabled" : "pause-disabled"}`}>
                        <div>
                          <span className="eyebrow">Пауза этой подписки</span>
                          <h2>{subscription.pause_limit > 0 ? `Доступно пауз: ${Math.max(0, subscription.pause_limit - subscription.pauses_used)}` : "Пауза недоступна"}</h2>
                          <p>7 дней — 1 пауза, 14 дней — 2, 30 дней — 3.</p>
                        </div>
                        <div className="pause-days">
                          {subscription.days.map((day) => {
                            const loadingKey = `${subscription.id}:${day.service_date}`;
                            const canPause = subscription.pause_limit > subscription.pauses_used
                              && ["PLANNED", "AVAILABLE"].includes(day.status);
                            return (
                              <button key={day.service_date} className={["PAUSED", "PAUSE_REQUESTED"].includes(day.status) ? "paused-day-button" : ""} type="button" disabled={!canPause || pauseLoading === loadingKey} onClick={() => requestPause(subscription.id, day.service_date)}>
                                {formatDate(day.service_date)}
                                <span>{pauseLoading === loadingKey ? "Ставим паузу…" : statusLabels[day.status] || day.status}</span>
                              </button>
                            );
                          })}
                        </div>
                        <small>Использовано пауз: {subscription.pauses_used} из {subscription.pause_limit}</small>
                      </section>

                      <section className="history-card">
                        <div className="history-tabs"><strong>Еда по этой подписке</strong></div>
                        <div className="history-list">
                          {subscription.days.map((day) => (
                            <div key={day.service_date}>
                              <time>{formatDate(day.service_date)}</time>
                              <strong>Обед MealPoint</strong>
                              <span>{statusLabels[day.status] || day.status}</span>
                            </div>
                          ))}
                        </div>
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
        <div className="history-tabs"><strong>История доставки</strong></div>
        <div className="empty-history">Заказов доставки пока нет.</div>
      </section>

      {!draft && !subscriptions.length && (
        <section className="empty-account">
          <span className="eyebrow">Подписка</span>
          <h1>Вы ещё не выбрали дни</h1>
          <p>Откройте календарь и выберите последовательность или пакет с нужной датой начала.</p>
          <Link href="/#subscription">Выбрать дни</Link>
        </section>
      )}
    </main>
  );
}
