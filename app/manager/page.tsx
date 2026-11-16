"use client";

import {Translated,useLanguage} from "../../components/LanguageProvider";
import {getLocale} from "../../lib/i18n/translate";
import Link from "next/link";
import ManagerPickupQr from "../../components/ManagerPickupQr";
import ManagerPoints from "../../components/ManagerPoints";
import ManagerPickupLocks from "../../components/ManagerPickupLocks";
import ManagerDiscounts from "../../components/ManagerDiscounts";
import ManagerAddDays from "../../components/ManagerAddDays";
import { FormEvent, useEffect, useState } from "react";

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
  fulfillment_type: "PICKUP" | "DELIVERY";
  payment_method: string | null;
  limen_state: string | null;
  limen_test: boolean | null;
  limen_order_id: string | null;
  limen_amount_rub: string | null;

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

type FulfillmentClient = {
  subscriptionId: string; code: string; fullName: string; phone: string | null; pickupPointName: string | null;
  address: string | null; requestedTime: string | null; dayStatus: string; pickedUp: boolean; pickedUpAt: string | null;
  pickedUpPointName: string | null; received: boolean; receivedAt: string | null; consumed: boolean;
  manuallyWrittenOff: boolean; manualWriteoffAt: string | null; manualWriteoffBy: string | null; manualWriteoffReason: string | null;
};
type ChatMessage = { id:string; senderRole:"CUSTOMER"|"MANAGER"; senderName:string|null; body:string; imageUrl?:string|null; attachmentType?:"image"|"pdf"|null; createdAt:string };
type FulfillmentDashboard = { serviceDate: string; resetHour: number; switchedToNextDay: boolean; pickupClients: FulfillmentClient[]; deliveryClients: FulfillmentClient[] };



const statusLabels: Record<string, string> = {
  AWAITING_ACTIVATION: "Проверить оплату — активировать",
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
  return new Intl.DateTimeFormat(getLocale(), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)));
}

export default function ManagerPage() {
  const {t,language}=useLanguage();

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
  const [fulfillmentDashboard, setFulfillmentDashboard] = useState<FulfillmentDashboard | null>(null);
  const [deliveryConfirm, setDeliveryConfirm] = useState<FulfillmentClient | null>(null);
  const [confirmingDelivery, setConfirmingDelivery] = useState("");

  const [writeoffTarget, setWriteoffTarget] = useState<FulfillmentClient | null>(null);
  const [writingOff, setWritingOff] = useState("");
  const [chatTarget, setChatTarget] = useState<ManagerSubscription | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

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

      // Authenticate separately: failures in inventory/clock panels must not hide QR.
      const sessionResponse=await fetch("/api/manager/pickup-qr",{cache:"no-store",credentials:"same-origin"});
      if(sessionResponse.status===401||sessionResponse.status===403){setAuthorized(false);throw new Error("Войдите в кабинет менеджера");}
      if(!sessionResponse.ok)throw new Error("Не удалось проверить сессию менеджера");
      setAuthorized(true);

      const fetchPanel = async (url: string) => {
        try {
          const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
          const data = await response.json().catch(() => ({}));
          return { response, data };
        } catch (error) {
          return { response: null, data: { ok: false, error: error instanceof Error ? error.message : "Ошибка сети" } };
        }
      };

      const [subscriptionsResult, pickupResult, clockResult, fulfillmentResult] = await Promise.all([
        fetchPanel("/api/manager/subscriptions"),
        fetchPanel("/api/manager/pickup-points"),
        fetchPanel("/api/manager/test-clock"),
        fetchPanel("/api/manager/fulfillment-today")
      ]);

      const panelErrors: string[] = [];

      // "Все покупки" загружается независимо от остальных панелей.
      // Ошибка в ПВ/доставке не должна очищать или скрывать подписки менеджера.
      if (subscriptionsResult.response?.ok && subscriptionsResult.data?.ok) {
        setSubscriptions(Array.isArray(subscriptionsResult.data.subscriptions) ? subscriptionsResult.data.subscriptions : []);
      } else {
        panelErrors.push(subscriptionsResult.data?.error || "Ошибка загрузки подписок");
      }

      if (pickupResult.response?.ok && pickupResult.data?.ok) {
        const pickupData = pickupResult.data as PickupDashboard;
        setPickupDashboard(pickupData);
        setDeliveredDrafts(Object.fromEntries(
          (pickupData.points || []).map((point: PickupPointToday) => [point.pickupPointName, String(point.deliveredCount)])
        ));
      } else {
        panelErrors.push(pickupResult.data?.error || "Ошибка загрузки пунктов выдачи");
      }

      if (clockResult.response?.ok && clockResult.data?.ok) {
        const clockData = clockResult.data;
        setTestClock(clockData.clock as AppClock);
        if (!testDirty) {
          setTestEnabled(Boolean(clockData.clock?.isTestMode));
          setTestDateTime(String(clockData.clock?.localDateTime || ""));
        }
      } else {
        panelErrors.push(clockResult.data?.error || "Ошибка загрузки тестового времени");
      }

      if (fulfillmentResult.response?.ok && fulfillmentResult.data?.ok) {
        setFulfillmentDashboard(fulfillmentResult.data as FulfillmentDashboard);
      } else {
        panelErrors.push(fulfillmentResult.data?.error || "Ошибка загрузки клиентов на сегодня");
      }

      if (panelErrors.length) setError(panelErrors.join(" · "));
      setAuthorized(true);
    } catch (loadError) {
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

  useEffect(() => {
    if (!chatTarget) return;
    const timer = window.setInterval(() => void loadManagerChat(chatTarget, true), 5000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTarget?.user_id]);

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

  async function manualPickupWriteoff() {
    if (!writeoffTarget || !fulfillmentDashboard) return;
    setWritingOff(writeoffTarget.subscriptionId); setError("");
    try {
      const response = await fetch("/api/manager/fulfillment-today", {
        method:"PATCH", headers:{"Content-Type":"application/json"}, credentials:"same-origin",
        body:JSON.stringify({subscriptionId:writeoffTarget.subscriptionId,serviceDate:fulfillmentDashboard.serviceDate,action:"pickup-writeoff",reason:"Клиент не забрал обед"})
      });
      const data=await response.json(); if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось списать обед");
      setWriteoffTarget(null); await loadManagerData();
    } catch (writeoffError) { setError(writeoffError instanceof Error?writeoffError.message:"Не удалось списать обед"); }
    finally { setWritingOff(""); }
  }

  async function loadManagerChat(target: ManagerSubscription, markRead=true) {
    try {
      const response=await fetch(`/api/manager/chat?userId=${encodeURIComponent(target.user_id)}${markRead?"&markRead=1":""}`,{cache:"no-store",credentials:"same-origin"});
      const data=await response.json(); if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось загрузить чат");
      setChatMessages(data.messages||[]); setChatError("");
      if(markRead)setSubscriptions(current=>current.map(item=>item.user_id===target.user_id?{...item,manager_unread_count:0}:item));
    } catch(e) { setChatError(e instanceof Error?e.message:"Не удалось загрузить чат"); }
  }

  async function openManagerChat(target: ManagerSubscription) {
    setChatTarget(target); setChatMessages([]); setChatText(""); setChatError(""); await loadManagerChat(target,true);
  }

  async function sendManagerChatMessage() {
    if(!chatTarget||!chatText.trim()||chatLoading)return; setChatLoading(true); setChatError("");
    try {
      const response=await fetch("/api/manager/chat",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({userId:chatTarget.user_id,text:chatText.trim()})});
      const data=await response.json(); if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось отправить сообщение");
      setChatText(""); await loadManagerChat(chatTarget,true);
    } catch(e) { setChatError(e instanceof Error?e.message:"Не удалось отправить сообщение"); }
    finally { setChatLoading(false); }
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
          <h1><Translated>{"Вход менеджера"}</Translated></h1>
          <p> </p>
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder={t("Логин")} autoComplete="username" required />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("Пароль")} required />
          {error && <p className="form-error"><Translated>{error}</Translated></p>}
          <button type="submit" disabled={loading}><Translated>{loading ? "Проверяем…" : "Открыть кабинет"}</Translated></button>
        </form>
      </main>
    );
  }

  return (
    <main className="page-shell manager-page">
      <section className="manager-heading">
        <div>
          <span className="eyebrow">MealPoint Manager</span>
          <h1><Translated>{"Управление"}</Translated></h1>
          <p><Translated>{"Подписки и остатки в пунктах выдачи обновляются каждые 15 секунд."}</Translated></p>
        </div>
        <div className="manager-heading-actions">
          <Link className="manager-scanner-link" href="/kitchen"><Translated>{"Открыть кухню"}</Translated></Link>
          <Link className="manager-scanner-link" href="/courier"><Translated>{"Открыть курьера"}</Translated></Link>
          <button type="button" onClick={() => void loadManagerData()} disabled={loading}><Translated>{loading ? "Обновляем…" : "Обновить"}</Translated></button>
          <button type="button" className="kitchen-logout" onClick={() => void logout()}><Translated>{"Выйти"}</Translated></button>
        </div>
      </section>

      <ManagerPickupQr />
      <ManagerPickupLocks />
      <ManagerPoints onChanged={()=>void loadManagerData()}/>
      <ManagerDiscounts/>
      {error && <p className="form-error"><Translated>{error}</Translated></p>}

      <section className={`test-clock-card ${testEnabled ? "is-enabled" : ""}`}>
        <div className="test-clock-heading"><div><span className="eyebrow"><Translated>{"Тестовый режим"}</Translated></span><h2><Translated>{"Подменить дату и время сайта"}</Translated></h2><p><Translated>{"Влияет на ЛК, паузы, автоматическое списание, ПВ, курьера и кухню."}</Translated></p></div>{testClock?.isTestMode && <span className="test-clock-badge">TEST</span>}</div>
        <div className="test-clock-controls">
          <label className="test-clock-switch"><input type="checkbox" checked={testEnabled} onChange={(event) => { setTestEnabled(event.target.checked); setTestDirty(true); }} /><span><Translated>{"Включить тестовое время"}</Translated></span></label>
          <label><Translated>{"Дата и время Пхукета"}</Translated><input type="datetime-local" value={testDateTime} onChange={(event) => { setTestDateTime(event.target.value); setTestDirty(true); }} disabled={!testEnabled} /></label>
          <button type="button" onClick={() => void saveTestClock()} disabled={savingClock}><Translated>{savingClock ? "Сохраняем…" : "Применить"}</Translated></button>
        </div>
        <p className="test-clock-current"><Translated>{"Сейчас сайт считает: "}</Translated><Translated>{testClock ? `${formatDate(testClock.date)}, ${String(testClock.hour).padStart(2,"0")}:${String(testClock.minute).padStart(2,"0")}` : "—"}</Translated></p>
      </section>

      <section className="daily-fulfillment-card">
        <div className="pickup-today-heading"><div><span className="eyebrow"><Translated>{"Клиенты на день"}</Translated></span><h2><Translated>{fulfillmentDashboard ? formatDate(fulfillmentDashboard.serviceDate) : "Сегодня"}</Translated></h2><p><Translated>{"В 22:00 панель автоматически переключается на следующий день — индикаторы снова становятся пустыми."}</Translated></p></div>{fulfillmentDashboard?.switchedToNextDay && <small><Translated>{"После 22:00 показан следующий день"}</Translated></small>}</div>
        <div className="fulfillment-columns">
          <section className="fulfillment-column"><div className="fulfillment-column-title"><h3><Translated>{"Самовывоз"}</Translated></h3><span><Translated>{fulfillmentDashboard?.pickupClients.length || 0}</Translated></span></div><div className="fulfillment-client-list">
            {fulfillmentDashboard?.pickupClients.map((client) => <article key={`pickup:${client.subscriptionId}`} className="fulfillment-client-row"><span className={`pickup-status-circle ${client.manuallyWrittenOff ? "is-written-off" : client.pickedUp ? "is-done" : "is-waiting"}`} /><div><strong>{client.fullName}</strong><small><Translated>{client.requestedTime || "—"}</Translated> · <Translated>{client.pickupPointName || "Точка не указана"}</Translated></small><small>{client.phone || "Телефон не указан"} · <Translated>{client.code}</Translated></small>{client.manuallyWrittenOff&&<small className="manual-writeoff-label"><Translated>{"Списан менеджером · клиент не забрал"}</Translated></small>}</div><div className="fulfillment-row-actions">{!client.pickedUp&&!client.manuallyWrittenOff&&!client.consumed&&<button type="button" className="pickup-writeoff-button" onClick={()=>setWriteoffTarget(client)}><Translated>{"Списать"}</Translated></button>}{client.pickedUp&&<span className="manager-done"><Translated>{"Получен"}</Translated></span>}{client.manuallyWrittenOff&&<span className="manager-writeoff-done"><Translated>{"Списан"}</Translated></span>}</div></article>)}
            {!fulfillmentDashboard?.pickupClients.length && <p className="empty-table"><Translated>{"Самовывоза на этот день нет."}</Translated></p>}
          </div></section>
          <section className="fulfillment-column"><div className="fulfillment-column-title"><h3><Translated>{"Доставка"}</Translated></h3><span><Translated>{fulfillmentDashboard?.deliveryClients.length || 0}</Translated></span></div><div className="fulfillment-client-list">
            {fulfillmentDashboard?.deliveryClients.map((client) => <article key={`delivery:${client.subscriptionId}`} className="fulfillment-client-row"><button type="button" className={`delivery-status-box ${client.received ? "is-done" : ""}`} disabled={client.received} onClick={() => setDeliveryConfirm(client)}><Translated>{client.received ? "✓" : ""}</Translated></button><div><strong>{client.fullName}</strong><small><Translated>{client.requestedTime || "—"}</Translated> · {client.phone || "Телефон не указан"}</small><small>{client.address || "Адрес не указан"}</small></div></article>)}
            {!fulfillmentDashboard?.deliveryClients.length && <p className="empty-table"><Translated>{"Доставок на этот день нет."}</Translated></p>}
          </div></section>
        </div>
      </section>

      <section className="pickup-today-card">
        <div className="pickup-today-heading">
          <div>
            <span className="eyebrow"><Translated>{"Пункты выдачи"}</Translated></span>
            <h2><Translated>{"Остатки на "}</Translated><Translated>{pickupDashboard ? formatDate(pickupDashboard.serviceDate) : "сегодня"}</Translated></h2>
            <p><Translated>{"Самовывоз списывается после успешного QR. Если клиент не забрал обед до 21:00, день автоматически считается использованным. Красный индикатор — клиент ещё не забрал, зелёный — QR успешно отсканирован."}</Translated></p>
          </div>
          {pickupDashboard && <small><Translated>{"После 21:00 панель автоматически переключится на следующий день."}</Translated></small>}
        </div>

        <div className="manager-table-wrap pickup-table-wrap">
          <table className="manager-table pickup-today-table">
            <thead>
              <tr>
                <th><Translated>{"Пункт выдачи"}</Translated></th>
                <th><Translated>{"Доставлено"}</Translated></th>
                <th><Translated>{"Списано"}</Translated></th>
                <th><Translated>{"Осталось"}</Translated></th>
                <th><Translated>{"Клиенты"}</Translated></th>
              </tr>
            </thead>
            <tbody>
              {pickupDashboard?.points.map((point) => (
                <tr key={point.pickupPointName} className={point.remainingCount > 0 ? "pickup-has-leftovers" : ""}>
                  <td>
                    <strong><Translated>{point.pickupPointName}</Translated></strong>
                    <small><Translated>{"По активным подпискам: "}</Translated><Translated>{point.plannedCount}</Translated></small>
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
                        aria-label={t(`Доставлено в ${point.pickupPointName}`)}
                      />
                      <button
                        type="button"
                        disabled={savingPoint === point.pickupPointName}
                        onClick={() => void saveDeliveredCount(point)}
                      >
                        <Translated>{savingPoint === point.pickupPointName ? "…" : "Сохранить"}</Translated>
                      </button>
                    </div>
                  </td>
                  <td><b className="pickup-number pickup-picked"><Translated>{point.pickedUpCount}</Translated></b></td>
                  <td><b className={`pickup-number ${point.remainingCount > 0 ? "pickup-left" : "pickup-empty"}`}><Translated>{point.remainingCount}</Translated></b></td>
                  <td>
                    {point.remainingCount === 0 ? (
                      <span className="manager-done"><Translated>{"Все обеды забрали"}</Translated></span>
                    ) : (
                      <span className="pickup-waiting"><Translated>{"См. клиентов выше"}</Translated></span>
                    )}
                  </td>
                </tr>
              ))}
              {!pickupDashboard?.points.length && (
                <tr><td colSpan={5} className="empty-table"><Translated>{"На сегодня активных обедов в пунктах выдачи нет."}</Translated></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="manager-subscriptions-section">
        <div className="pickup-today-heading">
          <div>
            <span className="eyebrow"><Translated>{"Подписки"}</Translated></span>
            <h2><Translated>{"Все покупки"}</Translated></h2>
          </div>
        </div>
        <div className="manager-table-wrap">
          <table className="manager-table">
            <thead>
              <tr>
                <th><Translated>{"Клиент"}</Translated></th>
                <th><Translated>{"Пункт и оплата"}</Translated></th>
                <th><Translated>{"Даты"}</Translated></th>
                <th><Translated>{"Цена"}</Translated></th>
                <th><Translated>{"Статус"}</Translated></th>
                <th><Translated>{"Действие"}</Translated></th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((item) => (
                <tr key={item.id} className={item.status === "AWAITING_ACTIVATION" ? "needs-activation" : ""}>
                  <td><strong>{item.full_name}</strong><small>{item.phone || "—"}</small>{item.status === "ACTIVE" && <small><Translated>{"Код: "}</Translated><Translated>{item.code}</Translated></small>}</td>
                  <td><strong><Translated>{item.fulfillment_type === "DELIVERY" ? "Доставка" : (item.pickup_point_name || "—")}</Translated></strong><small><Translated>{item.payment_method || "—"}</Translated></small></td>
                  <td>
                    <details>
                      <summary><Translated>{item.selected_days}</Translated><Translated>{" дней подписки"}</Translated></summary>
                      <div className="manager-dates">
                        {item.dates.map((day) => {
                          const paused = ["PAUSED", "PAUSE_REQUESTED"].includes(day.status);
                          return (
                            <span key={`${item.id}:${day.service_date}`} className={paused ? "manager-date-paused" : ""} title={t(statusLabels[day.status] || day.status)}>
                              <Translated>{formatDate(day.service_date)}</Translated><Translated>{paused ? " · ПАУЗА" : ""}</Translated>
                            </span>
                          );
                        })}
                      </div>
                    </details>
                  </td>
                  <td><strong><Translated>{item.total_thb.toLocaleString(getLocale())}</Translated> ฿</strong><small><Translated>{item.rate_thb}</Translated><Translated>{" ฿/день"}</Translated></small></td>
                  <td>
                    {item.limen_state&&<div style={{marginBottom:8}}>
                      <strong style={{display:"block",color:item.limen_state==="paid"&&!item.limen_test?"#167047":undefined}}>
                        <Translated>{item.limen_test?"Тест LimenThai: ":"LimenThai: "}</Translated>
                        <Translated>{item.limen_state==="paid"&&!item.limen_test?"Оплата получена":"Оплата не получена"}</Translated>
                      </strong>
                      {item.limen_test&&item.limen_state==="paid"&&<small><Translated>{"Тестовый платёж подтверждён. Реальные деньги не получены."}</Translated></small>}
                      {item.limen_state==="expired"&&<small><Translated>{"Срок оплаты истёк."}</Translated></small>}
                      {item.limen_state==="declined"&&<small><Translated>{"Платёж отклонён."}</Translated></small>}
                      {item.limen_amount_rub&&<small><Translated>{item.limen_amount_rub}</Translated> ₽ · <Translated>{item.total_thb.toLocaleString(getLocale())}</Translated> ฿</small>}
                      {item.limen_order_id&&<small><Translated>{"Заявка: "}</Translated><Translated>{item.limen_order_id}</Translated></small>}
                    </div>}
                    <span className={`status-pill status-${item.status.toLowerCase()}`}><Translated>{item.limen_state&&item.status==="AWAITING_ACTIVATION"?"Ожидает активации менеджером":statusLabels[item.status] || item.status}</Translated></span><small><Translated>{"Пауз: "}</Translated><Translated>{item.pauses_used}</Translated>/<Translated>{item.pause_limit}</Translated></small><small><Translated>{"Осталось: "}</Translated><Translated>{item.remaining_portions}</Translated></small></td>
                  <td>
                    <div className="manager-action-stack">
                      {["ACTIVE","COMPLETED","AWAITING_ACTIVATION"].includes(item.status)&&<ManagerAddDays id={item.id} name={item.full_name} lastDate={item.dates.at(-1)?.service_date||""} onDone={()=>void loadManagerData()}/>}
                      {["AWAITING_ACTIVATION", "PENDING_PAYMENT"].includes(item.status) ? (
                        <button className="activate-button" type="button" disabled={activating === item.id} onClick={() => void activateSubscription(item.id)}>
                          <Translated>{activating === item.id ? "Активируем…" : "Активировать"}</Translated>
                        </button>
                      ) : item.status === "PENDING_PAYMENT" ? (
                        <span className="manager-payment-waiting"><Translated>{"Не оплачено"}</Translated></span>
                      ) : (
                        <span className="manager-done"><Translated>{"Готово"}</Translated></span>
                      )}
                      <button type="button" className="manager-message-button" onClick={() => void openManagerChat(item)}><Translated>{" Чат"}</Translated>{item.manager_unread_count > 0 && <span className="message-alert"><Translated>{Math.min(item.manager_unread_count,99)}</Translated></span>}
                      </button>
                      <button
                        className="delete-subscription-button"
                        type="button"
                        disabled={deleting === item.id}
                        onClick={() => { setDeleteTarget(item); setError(""); }}
                      >
                        <Translated>{deleting === item.id ? "Удаляем…" : "Удалить"}</Translated>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!subscriptions.length && (
                <tr><td colSpan={6} className="empty-table"><Translated>{"Подписок пока нет."}</Translated></td></tr>
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
            <button className="modal-close" type="button" aria-label={t("Закрыть")} disabled={Boolean(deleting)} onClick={() => setDeleteTarget(null)}>×</button>
            <span className="eyebrow"><Translated>{"Удаление подписки"}</Translated></span>
            <h2 id="delete-subscription-title"><Translated>{"Подтвердите удаление"}</Translated></h2>
            <p><b>{deleteTarget.full_name}</b> · <Translated>{deleteTarget.code || "код ещё не присвоен"}</Translated></p>
            <p className="delete-warning"><Translated>{"Подписка, её даты и заявки доставки будут удалены без возможности восстановления."}</Translated></p>
            <p><Translated>{"Для подтверждения нажмите кнопку ниже. Действие необратимо."}</Translated></p>
            <div className="delete-confirm-actions">
              <button type="button" className="delete-confirm-cancel" disabled={Boolean(deleting)} onClick={() => setDeleteTarget(null)}><Translated>{"Отмена"}</Translated></button>
              <button type="button" className="delete-confirm-submit" disabled={Boolean(deleting)} onClick={() => void deleteSubscription()}>
                <Translated>{deleting ? "Удаляем…" : "Удалить подписку"}</Translated>
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
            <button className="modal-close" type="button" aria-label={t("Закрыть")} onClick={() => setContactPoint(null)}>×</button>
            <span className="eyebrow"><Translated>{"Не забрали сегодня"}</Translated></span>
            <h2 id="uncollected-title"><Translated>{contactPoint.pickupPointName}</Translated></h2>
            <p><Translated>{"Осталось обедов: "}</Translated><b><Translated>{contactPoint.remainingCount}</Translated></b><Translated>{". Позвоните клиентам и уточните, когда они смогут забрать заказ."}</Translated></p>
            <div className="uncollected-list">
              {!contactPoint.uncollectedClients.length && (
                <p className="empty-table"><Translated>{"Активных клиентов, которые не забрали обед, не найдено. Возможно, в ПВ были доставлены дополнительные порции."}</Translated></p>
              )}
              {contactPoint.uncollectedClients.map((client) => (
                <article key={`${client.phone || client.full_name}:${client.subscription_codes.join(",")}`}>
                  <div>
                    <strong>{client.full_name}</strong>
                    <small><Translated>{client.portions > 1 ? `Не забрано обедов: ${client.portions}` : "Не забран 1 обед"}</Translated></small>
                    <small><Translated>{"Подписки: "}</Translated><Translated>{client.subscription_codes.join(", ")}</Translated></small>
                  </div>
                  {client.phone ? (
                    <a href={`tel:${client.phone.replace(/[^+\d]/g, "")}`}>{client.phone}</a>
                  ) : (
                    <span><Translated>{"Телефон не указан"}</Translated></span>
                  )}
                </article>
              ))}
            </div>
            <button type="button" onClick={() => setContactPoint(null)}><Translated>{"Закрыть список"}</Translated></button>
          </section>
        </div>
      )}
      {writeoffTarget && <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!writingOff)setWriteoffTarget(null)}}><section className="payment-modal writeoff-confirm-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" disabled={Boolean(writingOff)} onClick={()=>setWriteoffTarget(null)}>×</button><span className="eyebrow"><Translated>{"Самовывоз"}</Translated></span><h2><Translated>{"Списать обед вручную?"}</Translated></h2><p><strong>{writeoffTarget.fullName}</strong><br/><Translated>{writeoffTarget.pickupPointName||"Точка не указана"}</Translated> · <Translated>{writeoffTarget.code}</Translated></p><p className="delete-warning"><Translated>{"Используйте это, если обед доставили на точку, но клиент его не забрал. День подписки будет уменьшен на 1 и повторно получить этот обед будет нельзя."}</Translated></p><div className="delivery-confirm-actions"><button type="button" className="confirm-yes" disabled={Boolean(writingOff)} onClick={()=>void manualPickupWriteoff()}><Translated>{writingOff?"Списываем…":"Списать обед"}</Translated></button><button type="button" className="confirm-no" disabled={Boolean(writingOff)} onClick={()=>setWriteoffTarget(null)}><Translated>{"Отмена"}</Translated></button></div></section></div>}
      {chatTarget && <div className="modal-backdrop chat-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setChatTarget(null)}}><section className="chat-window" role="dialog" aria-modal="true"><header className="chat-header"><div><span className="eyebrow"><Translated>{"Чат с клиентом"}</Translated></span><h2>{chatTarget.full_name}</h2><small>{chatTarget.phone||chatTarget.code}</small></div><button type="button" className="chat-close" onClick={()=>setChatTarget(null)}>×</button></header><div className="chat-messages">{!chatMessages.length&&<p className="chat-empty"><Translated>{"Сообщений пока нет."}</Translated></p>}{chatMessages.map(message=><article key={message.id} className={`chat-bubble ${message.senderRole==="MANAGER"?"chat-own":"chat-other"}`}><strong>{message.senderRole==="MANAGER"?"Менеджер":(message.senderName||chatTarget.full_name)}</strong>{message.body&&<p>{message.body}</p>}{message.imageUrl&&message.attachmentType==="pdf"?<a className="chat-file-link" href={message.imageUrl} target="_blank" rel="noreferrer"><Translated>{"📄 Открыть PDF"}</Translated></a>:message.imageUrl&&<a href={message.imageUrl} target="_blank" rel="noreferrer"><img className="chat-image" src={message.imageUrl} alt={t("Чек или изображение клиента")} loading="lazy"/></a>}<time><Translated>{new Date(message.createdAt).toLocaleString(getLocale(),{timeZone:"Asia/Bangkok"})}</Translated></time></article>)}</div>{chatError&&<p className="form-error chat-error"><Translated>{chatError}</Translated></p>}<div className="chat-composer"><textarea value={chatText} onChange={e=>setChatText(e.target.value)} maxLength={4000} placeholder={t("Ответ клиенту…")} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void sendManagerChatMessage();}}}/><button type="button" disabled={chatLoading||!chatText.trim()} onClick={()=>void sendManagerChatMessage()}><Translated>{chatLoading?"Отправляем…":"Отправить"}</Translated></button></div></section></div>}
      {deliveryConfirm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !confirmingDelivery) setDeliveryConfirm(null); }}><section className="payment-modal delivery-confirm-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" disabled={Boolean(confirmingDelivery)} onClick={() => setDeliveryConfirm(null)}>×</button><span className="eyebrow"><Translated>{"Доставка"}</Translated></span><h2><Translated>{"Клиент получил еду?"}</Translated></h2><p><strong>{deliveryConfirm.fullName}</strong><br/><Translated>{deliveryConfirm.requestedTime || "—"}</Translated> · {deliveryConfirm.address || "Адрес не указан"}</p><div className="delivery-confirm-actions"><button type="button" className="confirm-yes" disabled={Boolean(confirmingDelivery)} onClick={() => void confirmDeliveryReceived()}><Translated>{confirmingDelivery ? "Сохраняем…" : "Да"}</Translated></button><button type="button" className="confirm-no" disabled={Boolean(confirmingDelivery)} onClick={() => setDeliveryConfirm(null)}><Translated>{"Нет"}</Translated></button></div></section></div>}
    </main>
  );
}
