"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import ChatWindow from "../../components/ChatWindow";

type ManagerDay = {
  service_date: string;
  status: string;
};

type ManagerSubscription = {
  id: string;
  user_id: string;
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
  manager_unread_count: number;
  dates: ManagerDay[];
};

type UncollectedClient = {
  full_name: string;
  phone: string | null;
  portions: number;
  subscription_codes: string[];
};

type PickupPointToday = {
  pickupPointName: string;
  plannedCount: number;
  deliveredCount: number;
  pickedUpCount: number;
  remainingCount: number;
  uncollectedClients: UncollectedClient[];
};

type PickupDashboard = {
  serviceDate: string;
  testMode?: boolean;
  dayEndHour: number;
  isEndOfDay: boolean;
  points: PickupPointToday[];
};


type AppClock = {
  isTestMode: boolean;
  date: string;
  hour: number;
  minute: number;
  localDateTime: string;
};

type ChatClient = { userId: string; fullName: string; phone: string | null };
type FulfillmentClient = {
  subscriptionId: string; code: string; fullName: string; phone: string | null; pickupPointName: string | null;
  address: string | null; requestedTime: string | null; dayStatus: string; pickedUp: boolean; pickedUpAt: string | null;
  pickedUpPointName: string | null; received: boolean; receivedAt: string | null; consumed: boolean;
};
type FulfillmentDashboard = { serviceDate: string; resetHour: number; switchedToNextDay: boolean; pickupClients: FulfillmentClient[]; deliveryClients: FulfillmentClient[] };
type PickupQrPoint = { code: string; name: string; address: string };


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
  const [username, setUsername] = useState("manager");
  const [password, setPassword] = useState("");
  const [subscriptions, setSubscriptions] = useState<ManagerSubscription[]>([]);
  const [pickupDashboard, setPickupDashboard] = useState<PickupDashboard | null>(null);
  const [deliveredDrafts, setDeliveredDrafts] = useState<Record<string, string>>({});
  const [contactPoint, setContactPoint] = useState<PickupPointToday | null>(null);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState("");
  const [deleting, setDeleting] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ManagerSubscription | null>(null);
  const [savingPoint, setSavingPoint] = useState("");
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [testClock, setTestClock] = useState<AppClock | null>(null);
  const [testEnabled, setTestEnabled] = useState(false);
  const [testDateTime, setTestDateTime] = useState("");
  const [savingClock, setSavingClock] = useState(false);
  const [testDirty, setTestDirty] = useState(false);
  const [chatClient, setChatClient] = useState<ChatClient | null>(null);
  const [fulfillmentDashboard, setFulfillmentDashboard] = useState<FulfillmentDashboard | null>(null);
  const [deliveryConfirm, setDeliveryConfirm] = useState<FulfillmentClient | null>(null);
  const [confirmingDelivery, setConfirmingDelivery] = useState("");
  const [pickupQrPoints, setPickupQrPoints] = useState<PickupQrPoint[]>([]);
  const [qrPoint, setQrPoint] = useState<PickupQrPoint | null>(null);

  async function loadManagerData(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (event) {
        const loginResponse = await fetch("/api/staff/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ role: "MANAGER", username, password })
        });
        const loginData = await loginResponse.json();
        if (!loginResponse.ok || !loginData.ok) throw new Error(loginData.error || "Неверный логин или пароль");
        setPassword("");
      }

      const [subscriptionsResponse, pickupResponse, clockResponse, fulfillmentResponse, qrPointsResponse] = await Promise.all([
        fetch("/api/manager/subscriptions", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/manager/pickup-points", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/manager/test-clock", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/manager/fulfillment-today", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/manager/pickup-qr", { cache: "no-store", credentials: "same-origin" })
      ]);
      const [subscriptionsData, pickupData, clockData, fulfillmentData, qrPointsData] = await Promise.all([
        subscriptionsResponse.json(), pickupResponse.json(), clockResponse.json(), fulfillmentResponse.json(), qrPointsResponse.json()
      ]);

      if (!subscriptionsResponse.ok || !subscriptionsData.ok) throw new Error(subscriptionsData.error || "Ошибка загрузки подписок");
      if (!pickupResponse.ok || !pickupData.ok) throw new Error(pickupData.error || "Ошибка загрузки пунктов выдачи");
      if (!clockResponse.ok || !clockData.ok) throw new Error(clockData.error || "Ошибка загрузки тестового времени");
      if (!fulfillmentResponse.ok || !fulfillmentData.ok) throw new Error(fulfillmentData.error || "Ошибка загрузки клиентов на сегодня");
      if (!qrPointsResponse.ok || !qrPointsData.ok) throw new Error(qrPointsData.error || "Ошибка загрузки QR точек");

      setSubscriptions(subscriptionsData.subscriptions);
      setPickupDashboard(pickupData as PickupDashboard);
      setFulfillmentDashboard(fulfillmentData as FulfillmentDashboard);
      setPickupQrPoints((qrPointsData.points || []) as PickupQrPoint[]);
      setTestClock(clockData.clock as AppClock);
      if (!testDirty) {
        setTestEnabled(Boolean(clockData.clock.isTestMode));
        setTestDateTime(String(clockData.clock.localDateTime || ""));
      }
      setDeliveredDrafts(Object.fromEntries(
        (pickupData.points as PickupPointToday[]).map((point) => [point.pickupPointName, String(point.deliveredCount)])
      ));
      setAuthorized(true);
    } catch (loadError) {
      setAuthorized(false);
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/staff/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    setAuthorized(false);
    setSubscriptions([]);
    setPickupDashboard(null);
    setFulfillmentDashboard(null);
    setPassword("");
  }

  useEffect(() => {
    void loadManagerData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authorized) return;
    const timer = window.setInterval(() => void loadManagerData(), 15_000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, testDirty]);

  async function confirmDeliveryReceived() {
    if (!deliveryConfirm || !fulfillmentDashboard) return;
    setConfirmingDelivery(deliveryConfirm.subscriptionId);
    setError("");
    try {
      const response = await fetch("/api/manager/fulfillment-today", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ subscriptionId: deliveryConfirm.subscriptionId, serviceDate: fulfillmentDashboard.serviceDate, received: true })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось отметить получение");
      setDeliveryConfirm(null);
      await loadManagerData();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Не удалось отметить получение");
    } finally {
      setConfirmingDelivery("");
    }
  }

  async function activateSubscription(id: string) {
    setActivating(id);
    setError("");
    try {
      const response = await fetch("/api/manager/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id, action: "activate" })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Ошибка активации");
      await loadManagerData();
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Ошибка активации");
    } finally {
      setActivating("");
    }
  }


  async function deleteSubscription() {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    setError("");
    try {
      const response = await fetch("/api/manager/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: deleteTarget.id })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Не удалось удалить подписку");
      }
      setSubscriptions((current) => current.filter((subscription) => subscription.id !== deleteTarget.id));
      setDeleteTarget(null);
      await loadManagerData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить подписку");
    } finally {
      setDeleting("");
    }
  }

  async function saveTestClock() {
    if (testEnabled && !testDateTime) { setError("Выберите тестовые дату и время"); return; }
    setSavingClock(true);
    setError("");
    try {
      const response = await fetch("/api/manager/test-clock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ enabled: testEnabled, localDateTime: testDateTime })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось сохранить тестовое время");
      setTestClock(data.clock as AppClock);
      setTestDirty(false);
      await loadManagerData();
    } catch (clockError) {
      setError(clockError instanceof Error ? clockError.message : "Не удалось сохранить тестовое время");
    } finally { setSavingClock(false); }
  }

  async function saveDeliveredCount(point: PickupPointToday) {
    const deliveredCount = Number(deliveredDrafts[point.pickupPointName]);
    if (!Number.isInteger(deliveredCount) || deliveredCount < 0) {
      setError("Количество доставленных обедов должно быть целым числом от нуля");
      return;
    }

    setSavingPoint(point.pickupPointName);
    setError("");
    try {
      const response = await fetch("/api/manager/pickup-points", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          pickupPointName: point.pickupPointName,
          deliveredCount
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось сохранить");
      await loadManagerData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить количество");
    } finally {
      setSavingPoint("");
    }
  }

  if (!authorized) {
    return (
      <main className="page-shell manager-page">
        <form className="manager-login" onSubmit={(event) => void loadManagerData(event)}>
          <span className="eyebrow">MealPoint Manager</span>
          <h1>Вход менеджера</h1>
          <p>Вход защищён серверной сессией. Логин и пароль задаются в Railway.</p>
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Логин" autoComplete="username" required />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" required />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "Проверяем…" : "Открыть кабинет"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="page-shell manager-page">
      <section className="manager-heading">
        <div>
          <span className="eyebrow">MealPoint Manager</span>
          <h1>Управление</h1>
          <p>Подписки и остатки в пунктах выдачи обновляются каждые 15 секунд.</p>
        </div>
        <div className="manager-heading-actions">
          <Link className="manager-scanner-link" href="/kitchen">Открыть кухню</Link>
          <Link className="manager-scanner-link" href="/courier">Открыть курьера</Link>
          <button type="button" onClick={() => void loadManagerData()} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</button>
          <button type="button" className="kitchen-logout" onClick={() => void logout()}>Выйти</button>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      <section className={`test-clock-card ${testEnabled ? "is-enabled" : ""}`}>
        <div className="test-clock-heading"><div><span className="eyebrow">Тестовый режим</span><h2>Подменить дату и время сайта</h2><p>Влияет на ЛК, паузы, автоматическое списание, ПВ, курьера и кухню.</p></div>{testClock?.isTestMode && <span className="test-clock-badge">TEST</span>}</div>
        <div className="test-clock-controls">
          <label className="test-clock-switch"><input type="checkbox" checked={testEnabled} onChange={(event) => { setTestEnabled(event.target.checked); setTestDirty(true); }} /><span>Включить тестовое время</span></label>
          <label>Дата и время Пхукета<input type="datetime-local" value={testDateTime} onChange={(event) => { setTestDateTime(event.target.value); setTestDirty(true); }} disabled={!testEnabled} /></label>
          <button type="button" onClick={() => void saveTestClock()} disabled={savingClock}>{savingClock ? "Сохраняем…" : "Применить"}</button>
        </div>
        <p className="test-clock-current">Сейчас сайт считает: {testClock ? `${formatDate(testClock.date)}, ${String(testClock.hour).padStart(2,"0")}:${String(testClock.minute).padStart(2,"0")}` : "—"}</p>
      </section>

      <section className="daily-fulfillment-card">
        <div className="pickup-today-heading"><div><span className="eyebrow">Клиенты на день</span><h2>{fulfillmentDashboard ? formatDate(fulfillmentDashboard.serviceDate) : "Сегодня"}</h2><p>В 22:00 панель автоматически переключается на следующий день — индикаторы снова становятся пустыми.</p></div>{fulfillmentDashboard?.switchedToNextDay && <small>После 22:00 показан следующий день</small>}</div>
        <div className="fulfillment-columns">
          <section className="fulfillment-column"><div className="fulfillment-column-title"><h3>Самовывоз</h3><span>{fulfillmentDashboard?.pickupClients.length || 0}</span></div><div className="fulfillment-client-list">
            {fulfillmentDashboard?.pickupClients.map((client) => <article key={`pickup:${client.subscriptionId}`} className="fulfillment-client-row"><span className={`pickup-status-circle ${client.pickedUp ? "is-done" : "is-waiting"}`} /><div><strong>{client.fullName}</strong><small>{client.requestedTime || "—"} · {client.pickupPointName || "Точка не указана"}</small><small>{client.phone || "Телефон не указан"} · {client.code}</small></div></article>)}
            {!fulfillmentDashboard?.pickupClients.length && <p className="empty-table">Самовывоза на этот день нет.</p>}
          </div></section>
          <section className="fulfillment-column"><div className="fulfillment-column-title"><h3>Доставка</h3><span>{fulfillmentDashboard?.deliveryClients.length || 0}</span></div><div className="fulfillment-client-list">
            {fulfillmentDashboard?.deliveryClients.map((client) => <article key={`delivery:${client.subscriptionId}`} className="fulfillment-client-row"><button type="button" className={`delivery-status-box ${client.received ? "is-done" : ""}`} disabled={client.received} onClick={() => setDeliveryConfirm(client)}>{client.received ? "✓" : ""}</button><div><strong>{client.fullName}</strong><small>{client.requestedTime || "—"} · {client.phone || "Телефон не указан"}</small><small>{client.address || "Адрес не указан"}</small></div></article>)}
            {!fulfillmentDashboard?.deliveryClients.length && <p className="empty-table">Доставок на этот день нет.</p>}
          </div></section>
        </div>
      </section>
      <section className="pickup-qr-points-card"><div className="pickup-today-heading"><div><span className="eyebrow">QR точек выдачи</span><h2>Распечатать QR для каждой точки</h2><p>QR статический и подписан серверным секретом. Клиент может списать только свою подписку и только один раз за день.</p></div></div><div className="pickup-qr-point-grid">{pickupQrPoints.map(point => <button type="button" key={point.code} onClick={() => setQrPoint(point)}><strong>{point.name}</strong><small>{point.address}</small><span>Показать QR</span></button>)}</div></section>

      <section className="pickup-today-card">
        <div className="pickup-today-heading">
          <div>
            <span className="eyebrow">Пункты выдачи</span>
            <h2>Остатки на {pickupDashboard ? formatDate(pickupDashboard.serviceDate) : "сегодня"}</h2>
            <p>Самовывоз списывается только после QR. Красный индикатор — клиент ещё не забрал, зелёный — QR успешно отсканирован.</p>
          </div>
          {pickupDashboard && <small>После 22:00 панель автоматически переключится на следующий день.</small>}
        </div>

        <div className="manager-table-wrap pickup-table-wrap">
          <table className="manager-table pickup-today-table">
            <thead>
              <tr>
                <th>Пункт выдачи</th>
                <th>Доставлено</th>
                <th>Списано</th>
                <th>Осталось</th>
                <th>Клиенты</th>
              </tr>
            </thead>
            <tbody>
              {pickupDashboard?.points.map((point) => (
                <tr key={point.pickupPointName} className={point.remainingCount > 0 ? "pickup-has-leftovers" : ""}>
                  <td>
                    <strong>{point.pickupPointName}</strong>
                    <small>По активным подпискам: {point.plannedCount}</small>
                  </td>
                  <td>
                    <div className="delivered-editor">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={deliveredDrafts[point.pickupPointName] ?? point.deliveredCount}
                        onChange={(event) => setDeliveredDrafts((current) => ({
                          ...current,
                          [point.pickupPointName]: event.target.value
                        }))}
                        aria-label={`Доставлено в ${point.pickupPointName}`}
                      />
                      <button
                        type="button"
                        disabled={savingPoint === point.pickupPointName}
                        onClick={() => void saveDeliveredCount(point)}
                      >
                        {savingPoint === point.pickupPointName ? "…" : "Сохранить"}
                      </button>
                    </div>
                  </td>
                  <td><b className="pickup-number pickup-picked">{point.pickedUpCount}</b></td>
                  <td><b className={`pickup-number ${point.remainingCount > 0 ? "pickup-left" : "pickup-empty"}`}>{point.remainingCount}</b></td>
                  <td>
                    {point.remainingCount === 0 ? (
                      <span className="manager-done">Все обеды забрали</span>
                    ) : (
                      <span className="pickup-waiting">См. клиентов выше</span>
                    )}
                  </td>
                </tr>
              ))}
              {!pickupDashboard?.points.length && (
                <tr><td colSpan={5} className="empty-table">На сегодня активных обедов в пунктах выдачи нет.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="manager-subscriptions-section">
        <div className="pickup-today-heading">
          <div>
            <span className="eyebrow">Подписки</span>
            <h2>Все покупки</h2>
          </div>
        </div>
        <div className="manager-table-wrap">
          <table className="manager-table">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Пункт и оплата</th>
                <th>Даты</th>
                <th>Цена</th>
                <th>Статус</th>
                <th>Действие</th>
                <th>Сообщения</th>
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
                    <div className="manager-action-stack">
                      {item.status === "AWAITING_ACTIVATION" ? (
                        <button className="activate-button" type="button" disabled={activating === item.id} onClick={() => void activateSubscription(item.id)}>
                          {activating === item.id ? "Активируем…" : "Активировать"}
                        </button>
                      ) : item.status === "PENDING_PAYMENT" ? (
                        <span className="manager-payment-waiting">Не оплачено</span>
                      ) : (
                        <span className="manager-done">Готово</span>
                      )}
                      <button
                        className="delete-subscription-button"
                        type="button"
                        disabled={deleting === item.id}
                        onClick={() => { setDeleteTarget(item); setError(""); }}
                      >
                        {deleting === item.id ? "Удаляем…" : "Удалить"}
                      </button>
                    </div>
                  </td>
                  <td><button type="button" className="manager-message-button" onClick={() => setChatClient({ userId: item.user_id, fullName: item.full_name, phone: item.phone })}>Написать{item.manager_unread_count > 0 && <span className="message-alert">!</span>}</button></td>
                </tr>
              ))}
              {!subscriptions.length && (
                <tr><td colSpan={7} className="empty-table">Подписок пока нет.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !deleting) setDeleteTarget(null);
        }}>
          <section className="payment-modal delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-subscription-title">
            <button className="modal-close" type="button" aria-label="Закрыть" disabled={Boolean(deleting)} onClick={() => setDeleteTarget(null)}>×</button>
            <span className="eyebrow">Удаление подписки</span>
            <h2 id="delete-subscription-title">Подтвердите удаление</h2>
            <p><b>{deleteTarget.full_name}</b> · {deleteTarget.code || "код ещё не присвоен"}</p>
            <p className="delete-warning">Подписка, её даты и заявки доставки будут удалены без возможности восстановления.</p>
            <p>Для подтверждения нажмите кнопку ниже. Действие необратимо.</p>
            <div className="delete-confirm-actions">
              <button type="button" className="delete-confirm-cancel" disabled={Boolean(deleting)} onClick={() => setDeleteTarget(null)}>Отмена</button>
              <button type="button" className="delete-confirm-submit" disabled={Boolean(deleting)} onClick={() => void deleteSubscription()}>
                {deleting ? "Удаляем…" : "Удалить подписку"}
              </button>
            </div>
          </section>
        </div>
      )}

      {contactPoint && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setContactPoint(null);
        }}>
          <section className="payment-modal uncollected-modal" role="dialog" aria-modal="true" aria-labelledby="uncollected-title">
            <button className="modal-close" type="button" aria-label="Закрыть" onClick={() => setContactPoint(null)}>×</button>
            <span className="eyebrow">Не забрали сегодня</span>
            <h2 id="uncollected-title">{contactPoint.pickupPointName}</h2>
            <p>Осталось обедов: <b>{contactPoint.remainingCount}</b>. Позвоните клиентам и уточните, когда они смогут забрать заказ.</p>
            <div className="uncollected-list">
              {!contactPoint.uncollectedClients.length && (
                <p className="empty-table">Активных клиентов, которые не забрали обед, не найдено. Возможно, в ПВ были доставлены дополнительные порции.</p>
              )}
              {contactPoint.uncollectedClients.map((client) => (
                <article key={`${client.phone || client.full_name}:${client.subscription_codes.join(",")}`}>
                  <div>
                    <strong>{client.full_name}</strong>
                    <small>{client.portions > 1 ? `Не забрано обедов: ${client.portions}` : "Не забран 1 обед"}</small>
                    <small>Подписки: {client.subscription_codes.join(", ")}</small>
                  </div>
                  {client.phone ? (
                    <a href={`tel:${client.phone.replace(/[^+\d]/g, "")}`}>{client.phone}</a>
                  ) : (
                    <span>Телефон не указан</span>
                  )}
                </article>
              ))}
            </div>
            <button type="button" onClick={() => setContactPoint(null)}>Закрыть список</button>
          </section>
        </div>
      )}
      {deliveryConfirm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !confirmingDelivery) setDeliveryConfirm(null); }}><section className="payment-modal delivery-confirm-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" disabled={Boolean(confirmingDelivery)} onClick={() => setDeliveryConfirm(null)}>×</button><span className="eyebrow">Доставка</span><h2>Клиент получил еду?</h2><p><strong>{deliveryConfirm.fullName}</strong><br/>{deliveryConfirm.requestedTime || "—"} · {deliveryConfirm.address || "Адрес не указан"}</p><div className="delivery-confirm-actions"><button type="button" className="confirm-yes" disabled={Boolean(confirmingDelivery)} onClick={() => void confirmDeliveryReceived()}>{confirmingDelivery ? "Сохраняем…" : "Да"}</button><button type="button" className="confirm-no" disabled={Boolean(confirmingDelivery)} onClick={() => setDeliveryConfirm(null)}>Нет</button></div></section></div>}
      {qrPoint && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setQrPoint(null); }}><section className="payment-modal pickup-qr-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={() => setQrPoint(null)}>×</button><span className="eyebrow">QR точки выдачи</span><h2>{qrPoint.name}</h2><p>{qrPoint.address}</p><img src={`/api/manager/pickup-qr?point=${encodeURIComponent(qrPoint.code)}`} alt={`QR ${qrPoint.name}`} /><p><small>Распечатайте этот QR и разместите только на соответствующей точке выдачи.</small></p></section></div>}
      <ChatWindow
        open={Boolean(chatClient)}
        onClose={() => setChatClient(null)}
        mode="MANAGER"
        title={chatClient ? `${chatClient.fullName}${chatClient.phone ? ` · ${chatClient.phone}` : ""}` : "Чат с клиентом"}
        userId={chatClient?.userId}
        onRead={() => {
          if (!chatClient) return;
          setSubscriptions((current) => current.map((item) => item.user_id === chatClient.userId ? { ...item, manager_unread_count: 0 } : item));
        }}
      />
    </main>
  );
}
