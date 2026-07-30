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
  const [pickupDashboard, setPickupDashboard] = useState<PickupDashboard | null>(null);
  const [deliveredDrafts, setDeliveredDrafts] = useState<Record<string, string>>({});
  const [contactPoint, setContactPoint] = useState<PickupPointToday | null>(null);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState("");
  const [deleting, setDeleting] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ManagerSubscription | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [savingPoint, setSavingPoint] = useState("");
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [testClock, setTestClock] = useState<AppClock | null>(null);
  const [testEnabled, setTestEnabled] = useState(false);
  const [testDateTime, setTestDateTime] = useState("");
  const [savingClock, setSavingClock] = useState(false);
  const [testDirty, setTestDirty] = useState(false);
  const [chatClient, setChatClient] = useState<ChatClient | null>(null);

  async function loadManagerData(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");

    try {
      const headers = { "x-manager-password": password };
      const [subscriptionsResponse, pickupResponse, clockResponse] = await Promise.all([
        fetch("/api/manager/subscriptions", { headers, cache: "no-store" }),
        fetch("/api/manager/pickup-points", { headers, cache: "no-store" }),
        fetch("/api/manager/test-clock", { headers, cache: "no-store" })
      ]);
      const [subscriptionsData, pickupData, clockData] = await Promise.all([
        subscriptionsResponse.json(), pickupResponse.json(), clockResponse.json()
      ]);

      if (!subscriptionsResponse.ok || !subscriptionsData.ok) {
        throw new Error(subscriptionsData.error || "Ошибка загрузки подписок");
      }
      if (!pickupResponse.ok || !pickupData.ok) {
        throw new Error(pickupData.error || "Ошибка загрузки пунктов выдачи");
      }
      if (!clockResponse.ok || !clockData.ok) {
        throw new Error(clockData.error || "Ошибка загрузки тестового времени");
      }

      setSubscriptions(subscriptionsData.subscriptions);
      setPickupDashboard(pickupData as PickupDashboard);
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

  useEffect(() => {
    if (!authorized) return;
    const timer = window.setInterval(() => void loadManagerData(), 15_000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, password, testDirty]);

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
      await loadManagerData();
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Ошибка активации");
    } finally {
      setActivating("");
    }
  }


  async function deleteSubscription() {
    if (!deleteTarget) return;
    if (!deletePassword) {
      setError("Введите пароль менеджера для удаления подписки");
      return;
    }

    setDeleting(deleteTarget.id);
    setError("");
    try {
      const response = await fetch("/api/manager/subscriptions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-manager-password": deletePassword
        },
        body: JSON.stringify({ id: deleteTarget.id })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Не удалось удалить подписку");
      }
      setSubscriptions((current) => current.filter((subscription) => subscription.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeletePassword("");
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
        headers: { "Content-Type": "application/json", "x-manager-password": password },
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
        headers: {
          "Content-Type": "application/json",
          "x-manager-password": password
        },
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
          <p>Пароль задаётся переменной <b>MANAGER_PASSWORD</b> в Railway.</p>
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
          <Link className="manager-scanner-link" href="/scanner">Открыть сканер</Link>
          <button type="button" onClick={() => void loadManagerData()} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</button>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      <section className={`test-clock-card ${testEnabled ? "is-enabled" : ""}`}>
        <div className="test-clock-heading"><div><span className="eyebrow">Тестовый режим</span><h2>Подменить дату и время сайта</h2><p>Влияет на ЛК, QR, паузы, ПВ и кухню.</p></div>{testClock?.isTestMode && <span className="test-clock-badge">TEST</span>}</div>
        <div className="test-clock-controls">
          <label className="test-clock-switch"><input type="checkbox" checked={testEnabled} onChange={(event) => { setTestEnabled(event.target.checked); setTestDirty(true); }} /><span>Включить тестовое время</span></label>
          <label>Дата и время Пхукета<input type="datetime-local" value={testDateTime} onChange={(event) => { setTestDateTime(event.target.value); setTestDirty(true); }} disabled={!testEnabled} /></label>
          <button type="button" onClick={() => void saveTestClock()} disabled={savingClock}>{savingClock ? "Сохраняем…" : "Применить"}</button>
        </div>
        <p className="test-clock-current">Сейчас сайт считает: {testClock ? `${formatDate(testClock.date)}, ${String(testClock.hour).padStart(2,"0")}:${String(testClock.minute).padStart(2,"0")}` : "—"}</p>
      </section>

      <section className="pickup-today-card">
        <div className="pickup-today-heading">
          <div>
            <span className="eyebrow">Пункты выдачи</span>
            <h2>Остатки на {pickupDashboard ? formatDate(pickupDashboard.serviceDate) : "сегодня"}</h2>
            <p>«Забрали» меняется автоматически после каждого успешного сканирования QR.</p>
          </div>
          {pickupDashboard && !pickupDashboard.isEndOfDay && (
            <small>Список не забравших появится после {String(pickupDashboard.dayEndHour).padStart(2, "0")}:00</small>
          )}
        </div>

        <div className="manager-table-wrap pickup-table-wrap">
          <table className="manager-table pickup-today-table">
            <thead>
              <tr>
                <th>Пункт выдачи</th>
                <th>Доставлено</th>
                <th>Забрали</th>
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
                    {pickupDashboard.isEndOfDay && point.remainingCount > 0 ? (
                      <button className="contact-clients-button" type="button" onClick={() => setContactPoint(point)}>
                        Связаться с клиентами
                      </button>
                    ) : point.remainingCount === 0 ? (
                      <span className="manager-done">Все обеды забрали</span>
                    ) : (
                      <span className="pickup-waiting">До конца дня</span>
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
                        onClick={() => { setDeleteTarget(item); setDeletePassword(""); setError(""); }}
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
          if (event.currentTarget === event.target && !deleting) { setDeleteTarget(null); setDeletePassword(""); }
        }}>
          <section className="payment-modal delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-subscription-title">
            <button className="modal-close" type="button" aria-label="Закрыть" disabled={Boolean(deleting)} onClick={() => { setDeleteTarget(null); setDeletePassword(""); }}>×</button>
            <span className="eyebrow">Удаление подписки</span>
            <h2 id="delete-subscription-title">Подтвердите удаление</h2>
            <p><b>{deleteTarget.full_name}</b> · {deleteTarget.code || "код ещё не присвоен"}</p>
            <p className="delete-warning">Подписка, её даты, QR-сканирования и заявки доставки будут удалены без возможности восстановления.</p>
            <label>Пароль менеджера
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                placeholder="Введите пароль"
                autoFocus
                onKeyDown={(event) => { if (event.key === "Enter") void deleteSubscription(); }}
              />
            </label>
            <div className="delete-confirm-actions">
              <button type="button" className="delete-confirm-cancel" disabled={Boolean(deleting)} onClick={() => { setDeleteTarget(null); setDeletePassword(""); }}>Отмена</button>
              <button type="button" className="delete-confirm-submit" disabled={Boolean(deleting) || !deletePassword} onClick={() => void deleteSubscription()}>
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
      <ChatWindow
        open={Boolean(chatClient)}
        onClose={() => setChatClient(null)}
        mode="MANAGER"
        title={chatClient ? `${chatClient.fullName}${chatClient.phone ? ` · ${chatClient.phone}` : ""}` : "Чат с клиентом"}
        userId={chatClient?.userId}
        managerPassword={password}
        onRead={() => {
          if (!chatClient) return;
          setSubscriptions((current) => current.map((item) => item.user_id === chatClient.userId ? { ...item, manager_unread_count: 0 } : item));
        }}
      />
    </main>
  );
}
