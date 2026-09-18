"use client";

import Link from "next/link";
import PaymentDetails, { type PaymentConfig, type PaymentReceipt } from "../../components/PaymentDetails";
import { validDeliveryTime } from "../../lib/validation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMealTemplateForDate } from "../../data/meals";
import { pickupPoints } from "../../data/pickupPoints";

type Account = { userId:string; fullName:string; phone:string; address:string; photoUrl:string; termsAcceptedAt:string|null; telegramUsername:string };
type ChatMessage = { id:string; senderRole:"CUSTOMER"|"MANAGER"; senderName:string|null; body:string; imageUrl?:string|null; createdAt:string };
type Draft = { dates:string[]; selectedDays:number; rate:number; total:number; createdAt:string; fulfillmentType:"PICKUP"|"DELIVERY"; pickupPointName?:string; duplicateConfirmed?:boolean; checkoutKey?:string };
type Day = {
  service_date:string; status:string; fulfillment_type?:"PICKUP"|"DELIVERY"; requested_time?:string|null; delivery_address?:string|null;
  redeemed_at?:string|null; consumed_at?:string|null; delivery_received_at?:string|null; pickup_redeemed_point_name?:string|null;
};
type Subscription = {
  id:string; code:string|null; status:string; selected_days:number; remaining_portions:number; pause_limit:number; pauses_used:number;
  rate_thb:number; total_thb:number; starts_on:string; ends_on:string; payment_method:string|null; fulfillment_type:"PICKUP"|"DELIVERY";
  rub_rate?:number|null; pickup_point_name?:string|null; customer_name?:string; customer_phone?:string; delivery_address?:string|null; default_time?:string|null; days:Day[];
};
type Clock = { date:string; hour:number; minute:number; isTestMode?:boolean };

const paymentOptions = [
  {id:"PROMPTPAY",title:"PromptPay / Thai bank"},
  {id:"BANK_RU",title:"Банк РФ"},
  {id:"CASH",title:"Cash"}
];
const statusLabels:Record<string,string> = {
  AWAITING_ACTIVATION:"Ожидает оплаты и подтверждения",ACTIVE:"Активна",COMPLETED:"Завершена",CANCELLED:"Отменена",
  PLANNED:"Запланировано",AVAILABLE:"Активный день",PAUSED:"Пауза",PAUSE_REQUESTED:"Пауза",MISSED:"Использован",REDEEMED:"Получен"
};
function formatDate(value:string){ const m=value.match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m)return value; return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3],12))); }
function fallbackClock():Clock { const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()); const g=(t:string)=>p.find(x=>x.type===t)?.value||"0"; return {date:`${g("year")}-${g("month")}-${g("day")}`,hour:+g("hour"),minute:+g("minute")}; }
const validSubscriptionTime=validDeliveryTime;

function TelegramLogin() {
  const containerRef=useRef<HTMLDivElement|null>(null);
  const [message,setMessage]=useState("Загружаем вход через Telegram…");
  useEffect(()=>{
    let cancelled=false;
    void fetch("/api/auth/telegram/config",{cache:"no-store"}).then(async response=>{
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||"Telegram-вход не настроен");
      if(cancelled||!containerRef.current)return;
      // Telegram Login validates the origin that embeds the widget. Always use the
      // canonical MealPoint host so www/Railway preview domains cannot cause
      // "Bot domain invalid".
      if(data.publicOrigin && window.location.origin !== data.publicOrigin){
        const target = new URL(window.location.pathname + window.location.search + window.location.hash, data.publicOrigin);
        window.location.replace(target.toString());
        return;
      }
      containerRef.current.innerHTML="";
      const script=document.createElement("script");
      script.async=true; script.src="https://telegram.org/js/telegram-widget.js?22";
      script.setAttribute("data-telegram-login",data.botUsername);
      script.setAttribute("data-size","large");
      script.setAttribute("data-radius","12");
      script.setAttribute("data-userpic","false");
      script.setAttribute("data-request-access","write");
      script.setAttribute("data-auth-url",data.authUrl || `${window.location.origin}/api/auth/telegram/callback`);
      containerRef.current.appendChild(script);
      setMessage("");
    }).catch(error=>{if(!cancelled)setMessage(error instanceof Error?error.message:"Не удалось загрузить Telegram-вход")});
    return()=>{cancelled=true;};
  },[]);
  return <div className="telegram-login-box"><div ref={containerRef} className="telegram-login-widget" />{message&&<p className="form-error">{message}</p>}<p className="telegram-login-note">Нажмите кнопку Telegram и подтвердите вход. SMS больше не используется.</p></div>;
}


export default function AccountPage(){
  const [ready,setReady]=useState(false); const [account,setAccount]=useState<Account|null>(null); const [error,setError]=useState("");
  const [draft,setDraft]=useState<Draft|null>(null); const [subscriptions,setSubscriptions]=useState<Subscription[]>([]); const [clock,setClock]=useState<Clock>(fallbackClock());
  const [name,setName]=useState(""); const [phone,setPhone]=useState(""); const [address,setAddress]=useState("");
  const [fulfillment,setFulfillment]=useState<"PICKUP"|"DELIVERY">("PICKUP"); const [requestedTime,setRequestedTime]=useState("13:00");
  const [pickupPointName,setPickupPointName]=useState(pickupPoints[0]?.name||"");
  const [paymentMethod,setPaymentMethod]=useState(paymentOptions[0].id); const [paymentOpen,setPaymentOpen]=useState(false); const [submitting,setSubmitting]=useState(false);
  const [termsOpen,setTermsOpen]=useState(false); const [termsChecked,setTermsChecked]=useState(false); const [pauseLoading,setPauseLoading]=useState("");
  const [timeLoading,setTimeLoading]=useState("");
  const [scanTarget,setScanTarget]=useState<Subscription|null>(null); const [scanMessage,setScanMessage]=useState(""); const [scanBusy,setScanBusy]=useState(false);
  const [chatOpen,setChatOpen]=useState(false); const [chatMessages,setChatMessages]=useState<ChatMessage[]>([]); const [chatText,setChatText]=useState("");
  const [chatUnread,setChatUnread]=useState(0); const [chatLoading,setChatLoading]=useState(false); const [chatError,setChatError]=useState("");
  const [paymentConfig,setPaymentConfig]=useState<PaymentConfig>({thaiQr:null,russianQr:null,rubRate:null});
  const [receipt,setReceipt]=useState<PaymentReceipt|null>(null);
  const [chatImage,setChatImage]=useState<File|null>(null);
  const [profileStatus,setProfileStatus]=useState("Сохранено");
  const [scannerAttempt,setScannerAttempt]=useState(0);
  const scannerGenerationRef=useRef(0); const scannerRef=useRef<any>(null); const scanLockedRef=useRef(false);

  const loadAccount=useCallback(async()=>{
    const response=await fetch("/api/account/me",{cache:"no-store"});
    if(response.status===401){setAccount(null);setReady(true);return;}
    const data=await response.json(); if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось открыть кабинет");
    setAccount(data.account); setName(data.account.fullName||""); setPhone(data.account.phone||""); setAddress(data.account.address||"");
    if(!data.account.termsAcceptedAt)setTermsOpen(true); setReady(true);
  },[]);
  const loadSubscriptions=useCallback(async()=>{
    if(!account)return; const response=await fetch("/api/subscriptions/list",{cache:"no-store"}); const data=await response.json();
    if(response.ok&&data.ok){
      setSubscriptions(data.subscriptions); if(data.clock)setClock(data.clock);
    } else setError(data.error||"Ошибка подписок");
  },[account]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const telegramStatus=params.get("telegram");
    if(telegramStatus&&telegramStatus!=="ok"){
      const telegramErrors:Record<string,string>={
        TELEGRAM_NOT_CONFIGURED:"Telegram-вход не настроен на сервере",
        TELEGRAM_AUTH_EXPIRED:"Подтверждение Telegram устарело. Попробуйте войти ещё раз.",
        BAD_TELEGRAM_AUTH:"Не удалось проверить подпись Telegram. Попробуйте войти ещё раз."
      };
      setError(telegramErrors[telegramStatus]||"Не удалось войти через Telegram");
    }
    if(telegramStatus){params.delete("telegram");const query=params.toString();window.history.replaceState({},"",`${window.location.pathname}${query?`?${query}`:""}${window.location.hash}`);}
    const raw=localStorage.getItem("mealpoint_subscription_draft");
    if(raw)try{const parsed=JSON.parse(raw) as Draft;if(!parsed.checkoutKey){parsed.checkoutKey=crypto.randomUUID();localStorage.setItem("mealpoint_subscription_draft",JSON.stringify(parsed));}setDraft(parsed);setFulfillment(parsed.fulfillmentType||"PICKUP");if(parsed.pickupPointName)setPickupPointName(parsed.pickupPointName);}catch{localStorage.removeItem("mealpoint_subscription_draft");}
    void loadAccount().catch(e=>{setError(e instanceof Error?e.message:"Не удалось загрузить кабинет");setReady(true);});
    void fetch("/api/payments/config",{cache:"no-store"}).then(r=>r.json()).then(d=>{if(d.ok)setPaymentConfig(d);}).catch(()=>setError("Не удалось загрузить реквизиты оплаты"));
    void fetch("/api/app-time",{cache:"no-store"}).then(r=>r.json()).then(d=>d.ok&&setClock(d.clock));
  },[loadAccount]);
  useEffect(()=>{if(account)void loadSubscriptions();},[account,loadSubscriptions]);
  useEffect(()=>{
    if(!account)return;
    const payload={fullName:name.trim(),phone:phone.trim(),address:address.trim()};
    if(payload.fullName===account.fullName&&payload.phone===account.phone&&payload.address===account.address){setProfileStatus("Сохранено");return;}
    if(payload.fullName.length<2||(payload.phone&&payload.phone.length<8)){setProfileStatus("Проверьте данные");return;}
    let cancelled=false;setProfileStatus("Сохраняем…");
    const timer=setTimeout(()=>{void fetch("/api/account/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(async r=>({r,d:await r.json()})).then(({r,d})=>{
      if(cancelled)return;if(!r.ok||!d.ok)throw new Error(d.error||"Не удалось сохранить данные");setAccount(d.account);setProfileStatus("Сохранено");
    }).catch(e=>{if(!cancelled){setProfileStatus("Не сохранено");setError(e.message);}});},800);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[account?.userId,name,phone,address]);

  useEffect(()=>{if(!account)return;const timer=setInterval(()=>{void loadSubscriptions();},30000);return()=>clearInterval(timer);},[account,loadSubscriptions]);
  const loadChat=useCallback(async(markRead=false)=>{
    if(!account)return;
    try{
      const response=await fetch(`/api/account/chat${markRead?"?markRead=1":""}`,{cache:"no-store",credentials:"same-origin"});
      const data=await response.json(); if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось загрузить чат");
      setChatMessages(data.messages||[]); setChatUnread(Number(data.unreadCount||0)); setChatError("");
    }catch(e){setChatError(e instanceof Error?e.message:"Не удалось загрузить чат");}
  },[account]);
  useEffect(()=>{if(!account)return;void loadChat(false);const timer=window.setInterval(()=>void loadChat(chatOpen),chatOpen?5000:15000);return()=>window.clearInterval(timer);},[account,chatOpen,loadChat]);
  async function openChat(){setChatOpen(true);await loadChat(true);}
  async function sendChatMessage(){
    const text=chatText.trim();if((!text&&!chatImage)||chatLoading)return;setChatLoading(true);setChatError("");
    try{const form=new FormData();form.set("text",text);if(chatImage)form.set("image",chatImage);const response=await fetch("/api/account/chat",{method:"POST",credentials:"same-origin",body:form});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось отправить сообщение");setChatText("");setChatImage(null);await loadChat(true);}catch(e){setChatError(e instanceof Error?e.message:"Не удалось отправить сообщение");}finally{setChatLoading(false);}
  }

  const stopScanner=useCallback(async()=>{ scannerGenerationRef.current+=1; const scanner=scannerRef.current; scannerRef.current=null; if(scanner){ try{await scanner.stop();}catch{} try{await scanner.clear();}catch{} } },[]);
  const redeemQr=useCallback(async(subscription:Subscription,payload:string)=>{
    if(scanLockedRef.current)return; scanLockedRef.current=true; setScanBusy(true); setScanMessage("Проверяем QR…");
    try{
      await stopScanner();
      const response=await fetch("/api/subscriptions/pickup-redeem",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({subscriptionId:subscription.id,qrPayload:payload})});
      const data=await response.json(); if(!response.ok||!data.ok)throw new Error(data.error||"Ошибка чтения QR");
      setScanMessage(data.message||"Обед получен. День подписки списан."); await loadSubscriptions();
    }catch(e){setScanMessage(e instanceof Error?e.message:"Ошибка чтения QR");}
    finally{setScanBusy(false);scanLockedRef.current=false;}
  },[loadSubscriptions,stopScanner]);
  useEffect(()=>{
    if(!scanTarget)return; let cancelled=false;
    if(!window.isSecureContext){setScanMessage("Камера работает через HTTPS. Можно выбрать фото QR.");return;} setScanMessage("Открываем камеру…");
    void import("html5-qrcode").then(async({Html5Qrcode})=>{
      if(cancelled)return; const scanner=new Html5Qrcode("pickup-qr-reader"); scannerRef.current=scanner; const generation=scannerGenerationRef.current;
      try{ await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:250,height:250}},decoded=>{if(!cancelled&&generation===scannerGenerationRef.current)void redeemQr(scanTarget,decoded)},()=>undefined); if(cancelled||generation!==scannerGenerationRef.current){try{await scanner.stop();await scanner.clear();}catch{}return;} if(!scanLockedRef.current)setScanMessage("Наведите камеру на QR-код пункта выдачи"); }
      catch{ if(!cancelled)setScanMessage("Не удалось открыть камеру. Разрешите доступ или выберите фотографию QR."); }
    }).catch(()=>setScanMessage("Сканер QR недоступен"));
    return()=>{cancelled=true;void stopScanner();};
  },[scanTarget,redeemQr,stopScanner,scannerAttempt]);
  async function scanFile(file:File){
    if(!scanTarget)return; setScanBusy(true); setScanMessage("Читаем QR с фотографии…");
    try{ await stopScanner(); const {Html5Qrcode}=await import("html5-qrcode"); const scanner=new Html5Qrcode("pickup-qr-reader"); scannerRef.current=scanner; const decoded=await scanner.scanFile(file,true); await scanner.clear(); scannerRef.current=null; await redeemQr(scanTarget,decoded); }
    catch{setScanMessage("Ошибка чтения QR");setScanBusy(false);}
  }

  const scannablePickupSubscriptions=useMemo(()=>subscriptions.filter(s=>{
    const todayDay=s.days.find(day=>day.service_date===clock.date);
    return s.fulfillment_type==="PICKUP"&&s.status==="ACTIVE"&&Boolean(todayDay)&&["PLANNED","AVAILABLE"].includes(todayDay?.status||"")&&clock.hour<22;
  }),[subscriptions,clock]);
  const primaryScannablePickup=scannablePickupSubscriptions[0]||null;
  const hasPickupSubscription=subscriptions.some(s=>s.fulfillment_type==="PICKUP"&&["ACTIVE","COMPLETED","AWAITING_ACTIVATION"].includes(s.status));

  const exactDuplicate=useMemo(()=>draft?subscriptions.some(s=>s.status==="ACTIVE"&&s.days.map(d=>d.service_date).join("|")===draft.dates.join("|")):false,[draft,subscriptions]);
  async function acceptTerms(){ if(!termsChecked)return; const r=await fetch("/api/account/terms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true})}); const d=await r.json(); if(!r.ok||!d.ok){setError(d.error);return;} setAccount(a=>a?{...a,termsAcceptedAt:d.termsAcceptedAt}:a); setTermsOpen(false); }
  async function logout(){await fetch("/api/account/logout",{method:"POST"});setAccount(null);setSubscriptions([]);}
  async function createSubscription(){
    if(!draft||(fulfillment==="DELIVERY"&&!validSubscriptionTime(requestedTime)))return setError("Выберите время с 12:00 до 18:00");
    if(!account||account.fullName.trim().length<2||account.phone.trim().length<8)return setError("Заполните имя и телефон");
    if(fulfillment==="DELIVERY"&&address.trim().length<5)return setError("Введите адрес доставки");
    if(fulfillment==="PICKUP"&&!pickupPoints.some(p=>p.name===pickupPointName))return setError("Выберите пункт самовывоза");
    if(profileStatus!=="Сохранено")return setError("Дождитесь сохранения данных клиента");
    setSubmitting(true);setError("");
    try{ const r=await fetch("/api/subscriptions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dates:draft.dates,paymentMethod,fulfillmentType:fulfillment,address,requestedTime:fulfillment==="DELIVERY"?requestedTime:null,pickupPointName,checkoutKey:draft.checkoutKey})}); const d=await r.json(); if(!r.ok||!d.ok)throw new Error(d.error||"Ошибка оформления"); localStorage.removeItem("mealpoint_subscription_draft"); setReceipt({method:d.subscription.paymentMethod,total:d.subscription.total,rubRate:d.subscription.rubRate});setDraft(null);setPaymentOpen(false);await loadSubscriptions(); }
    catch(e){setError(e instanceof Error?e.message:"Ошибка оформления");}finally{setSubmitting(false);}
  }
  async function pause(id:string,date:string){setPauseLoading(`${id}:${date}`);const r=await fetch("/api/subscriptions/pause",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,serviceDate:date})});const d=await r.json();if(!r.ok||!d.ok)setError(d.error||"Ошибка паузы");else await loadSubscriptions();setPauseLoading("");}
  async function changeTime(id:string,date:string,time:string){ if(!validSubscriptionTime(time))return setError("Время должно быть с 12:00 до 18:00"); setTimeLoading(`${id}:${date}`); const r=await fetch("/api/subscriptions/schedule",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId:id,serviceDate:date,requestedTime:time})});const d=await r.json();if(!r.ok||!d.ok)setError(d.error||"Не удалось изменить время");else await loadSubscriptions();setTimeLoading(""); }
  function canEditDay(date:string){ if(date>clock.date)return true; if(date<clock.date)return false; return clock.hour<11||(clock.hour===11&&clock.minute<30); }

  if(!ready)return <main className="page-shell account-page"><section className="empty-account"><h1>Открываем личный кабинет…</h1></section></main>;
  if(!account)return <main className="page-shell account-page"><section className="account-login-shell"><div className="account-login-card"><span className="eyebrow">Личный кабинет</span><h1>Вход и регистрация через Telegram</h1><p>Авторизуйтесь своим Telegram-аккаунтом. После первого входа укажите телефон для связи в профиле.</p>{error&&<p className="form-error">{error}</p>}<TelegramLogin/><Link href="/">Вернуться к подписке</Link></div></section></main>;

  return <main className="page-shell account-page">
    <section className="account-top"><div><span className="eyebrow">Личный кабинет</span><h1>Здравствуйте, {name||"клиент"}</h1><p>{account.telegramUsername?`@${account.telegramUsername}`:"Telegram"}{phone?` · ${phone}`:""}</p></div><div className="account-top-actions"><button type="button" className="account-message-button" aria-label="Чат с менеджером" onClick={()=>void openChat()}>💬{chatUnread>0&&<span className="message-alert">{Math.min(chatUnread,99)}</span>}</button><Link className="new-subscription-link" href="/#subscription">Оформить подписку</Link><button type="button" className="text-button muted" onClick={logout}>Выйти</button></div></section>
    {clock.isTestMode&&<p className="test-mode-banner">Тестовое время: {clock.date} {String(clock.hour).padStart(2,"0")}:{String(clock.minute).padStart(2,"0")}</p>}
    {error&&<p className="form-error account-error">{error}</p>}
    <section className="account-profile-form"><div className="account-profile-heading"><div><span className="eyebrow">Данные клиента</span><h2>Контакты</h2></div><span className={`autosave-status ${profileStatus==="Сохранено"?"saved":profileStatus==="Сохраняем…"?"saving":"error"}`}>{profileStatus}</span></div><div className="profile-fields-grid"><label>Имя<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Телефон<input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+66 81 234 5678"/></label><label className="profile-address-field">Адрес доставки<textarea value={address} onChange={e=>setAddress(e.target.value)}/></label></div></section>

    <section className="account-pickup-scanner-card">
      <div><span className="eyebrow">Самовывоз</span><h2>Сканировать QR</h2><p>{primaryScannablePickup?`Сегодня доступна подписка ${primaryScannablePickup.code?`№ ${primaryScannablePickup.code}`:"на самовывоз"}${primaryScannablePickup.pickup_point_name?` · ${primaryScannablePickup.pickup_point_name}`:""}.`:hasPickupSubscription?"Сегодня по подписке нет активного обеда для самовывоза.":phone?"Активной подписки на самовывоз пока нет.":"Заполните контактный телефон в блоке «Данные клиента»."}</p></div>
      <button type="button" className="pickup-scan-button account-main-scan-button" disabled={!primaryScannablePickup} onClick={()=>{if(primaryScannablePickup){setScanMessage("");setScanTarget(primaryScannablePickup)}}}>Сканировать QR</button>
    </section>

    {draft&&<section className="purchase-card"><div><span className="eyebrow">Новая подписка</span><h2>{draft.selectedDays} дней неодинаковой еды</h2><p>{formatDate(draft.dates[0])} — {formatDate(draft.dates[draft.dates.length-1])}</p><div className="purchase-numbers"><strong>{draft.total.toLocaleString("ru-RU")} ฿</strong><span>{draft.rate} ฿ за день</span></div></div><div className="subscription-checkout-form"><div className="fulfillment-choice-summary"><strong>{fulfillment==="PICKUP"?"Самовывоз":"Доставка"}</strong><small>{fulfillment==="PICKUP"?(pickupPointName||"Точка не выбрана"):"По адресу клиента"}</small><Link href="/#subscription">Изменить способ получения</Link></div><label>Имя<input value={account.fullName} readOnly aria-readonly="true"/></label><label>Телефон<input value={account.phone} readOnly aria-readonly="true"/></label>{fulfillment==="DELIVERY"&&<label>Адрес доставки<textarea value={address} onChange={e=>setAddress(e.target.value)}/></label>}{fulfillment==="DELIVERY"&&<label>Время доставки<input type="time" min="12:00" max="18:00" step="900" value={requestedTime} onChange={e=>setRequestedTime(e.target.value)}/></label>}<small>Имя и телефон меняются в блоке «Данные клиента».</small><button type="button" disabled={profileStatus!=="Сохранено"} onClick={()=>setPaymentOpen(true)}>{exactDuplicate?"Оформить ещё одну подписку":"Перейти к оплате"}</button></div></section>}

    {!!subscriptions.length&&<section className="subscriptions-list-section"><div className="subscriptions-list-heading"><div><span className="eyebrow">Мои подписки</span><h2>{subscriptions.length}</h2></div><p>Самовывоз: день списывается после успешного сканирования QR на точке. Доставка: день списывается автоматически после 18:00.</p></div><div className="subscriptions-list">{subscriptions.map((s,index)=>{
      const todayDay=s.days.find(day=>day.service_date===clock.date); const canScan=s.fulfillment_type==="PICKUP"&&s.status==="ACTIVE"&&Boolean(todayDay)&&["PLANNED","AVAILABLE"].includes(todayDay?.status||"")&&clock.hour<22; const pickedToday=Boolean(todayDay?.redeemed_at)||todayDay?.status==="REDEEMED";
      return <article className="subscription-instance" key={s.id}><section className={`active-subscription-card ${s.status==="ACTIVE"?"is-active":"is-waiting"}`}><div><span className="eyebrow">Подписка №{subscriptions.length-index}</span><h2>{statusLabels[s.status]||s.status}</h2><p>{formatDate(s.starts_on)} — {formatDate(s.ends_on)}</p><p>Осталось <strong>{s.remaining_portions}</strong> из {s.selected_days} дней.</p><small>{s.fulfillment_type==="DELIVERY"?"Доставка":`Самовывоз · ${s.pickup_point_name||"точка не выбрана"}`}</small>{s.status==="AWAITING_ACTIVATION"&&<button type="button" onClick={()=>setReceipt({method:s.payment_method||"CASH",total:s.total_thb,rubRate:s.rub_rate?Number(s.rub_rate):null})}>Реквизиты для оплаты</button>}</div>{s.fulfillment_type==="PICKUP"&&<div className="subscription-pickup-scan-actions">{pickedToday?<span className="pickup-today-success">✓ Сегодня получено</span>:<button type="button" className="pickup-scan-button" disabled={!canScan} onClick={()=>{setScanMessage("");setScanTarget(s)}}>Сканировать QR</button>}{!todayDay&&s.status==="ACTIVE"&&<small>QR активен только в выбранный день</small>}</div>}</section>{s.status==="ACTIVE"&&<details className="subscription-details" open={index===0}><summary>Дни, время и пауза</summary><section className="history-card"><div className="history-list subscription-meal-history">{s.days.map(day=>{const meal=getMealTemplateForDate(day.service_date);const editable=canEditDay(day.service_date)&&["PLANNED","AVAILABLE"].includes(day.status);const loading=`${s.id}:${day.service_date}`;return <div key={day.service_date}><time>{formatDate(day.service_date)}</time><span className="history-meal-name"><strong>{meal.title}</strong><small>{statusLabels[day.status]||day.status}{day.pickup_redeemed_point_name?` · ${day.pickup_redeemed_point_name}`:""}</small></span><span className="meal-day-actions">{editable?<>{s.fulfillment_type==="DELIVERY"&&<input aria-label={`Время доставки ${formatDate(day.service_date)}`} type="time" min="12:00" max="18:00" step="900" defaultValue={day.requested_time||s.default_time||"13:00"} onBlur={e=>{if(e.target.value&&e.target.value!==(day.requested_time||s.default_time))void changeTime(s.id,day.service_date,e.target.value)}} disabled={timeLoading===loading}/>}<button type="button" disabled={pauseLoading===loading||s.pause_limit<=s.pauses_used} onClick={()=>void pause(s.id,day.service_date)}>{pauseLoading===loading?"Пауза…":"Поставить на паузу"}</button></>:<em>{s.fulfillment_type==="DELIVERY"?(day.requested_time||s.default_time||"—"):"Самовывоз"}</em>}</span></div>})}</div></section>{s.fulfillment_type==="DELIVERY"&&<p className="subscription-cutoff-note">Время доставки на текущий день можно изменить до 11:30. Для следующих дней время выбирается отдельно.</p>}</details>}</article>})}</div></section>}

    {!draft&&!subscriptions.length&&<section className="empty-account"><h1>Подписок пока нет</h1><p>Выберите дни и блюда в разделе меню подписки.</p><Link href="/#subscription">Открыть подписку</Link></section>}

    {chatOpen&&<div className="modal-backdrop chat-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)setChatOpen(false)}}><section className="chat-window" role="dialog" aria-modal="true"><header className="chat-header"><div><span className="eyebrow">MealPoint</span><h2>Чат с менеджером</h2></div><button type="button" className="chat-close" onClick={()=>setChatOpen(false)}>×</button></header><div className="chat-messages">{!chatMessages.length&&<p className="chat-empty">Напишите менеджеру — история сообщений сохранится здесь.</p>}{chatMessages.map(message=><article key={message.id} className={`chat-bubble ${message.senderRole==="CUSTOMER"?"chat-own":"chat-other"}`}><strong>{message.senderRole==="CUSTOMER"?"Вы":(message.senderName||"Менеджер")}</strong><p>{message.body}</p>{message.imageUrl&&<a href={message.imageUrl} target="_blank" rel="noreferrer"><img className="chat-image" src={message.imageUrl} alt="Изображение в чате" loading="lazy"/></a>}<time>{new Date(message.createdAt).toLocaleString("ru-RU",{timeZone:"Asia/Bangkok"})}</time></article>)}</div>{chatError&&<p className="form-error chat-error">{chatError}</p>}<div className="chat-attachment"><label>📎 Прикрепить изображение<input type="file" accept="image/jpeg,image/png,image/webp" disabled={chatLoading} onChange={e=>{const f=e.target.files?.[0];if(f&&f.size>5*1024*1024)setChatError("Размер изображения — до 5 МБ");else if(f){setChatImage(f);setChatError("");}e.target.value="";}}/></label>{chatImage&&<button type="button" onClick={()=>setChatImage(null)}>{chatImage.name} ×</button>}</div><div className="chat-composer"><textarea value={chatText} onChange={e=>setChatText(e.target.value)} maxLength={4000} placeholder="Напишите сообщение…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void sendChatMessage();}}}/><button type="button" disabled={chatLoading||(!chatText.trim()&&!chatImage)} onClick={()=>void sendChatMessage()}>{chatLoading?"Отправляем…":"Отправить"}</button></div></section></div>}
    {scanTarget&&<div className="modal-backdrop qr-customer-backdrop"><section className="payment-modal customer-qr-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={()=>{void stopScanner();setScanTarget(null)}}>×</button><span className="eyebrow">Самовывоз</span><h2>Сканировать QR точки</h2><p>{scanTarget.pickup_point_name||"MealPoint"}. Сканирование можно выполнить только один раз за сегодняшний день.</p><div id="pickup-qr-reader" className="customer-qr-reader"/><p className={scanMessage==="Ошибка чтения QR"?"form-error qr-scan-message":"qr-scan-message"}>{scanMessage}</p><button type="button" disabled={scanBusy} onClick={()=>setScannerAttempt(n=>n+1)}>Включить камеру снова</button><label className="scanner-file-button customer-file-scan">Выбрать фото QR<input type="file" accept="image/*" capture="environment" disabled={scanBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void scanFile(file);e.currentTarget.value=""}}/></label><button type="button" className="text-button muted" onClick={()=>{void stopScanner();setScanTarget(null)}}>Закрыть</button></section></div>}
    {paymentOpen&&draft&&<div className="modal-backdrop"><div className="payment-modal"><button className="modal-close" onClick={()=>setPaymentOpen(false)}>×</button><span className="eyebrow">Оплата подписки</span><h2>Выберите способ оплаты</h2><div className="payment-options">{paymentOptions.map(o=><label key={o.id} className={paymentMethod===o.id?"selected":""}><input type="radio" checked={paymentMethod===o.id} onChange={()=>setPaymentMethod(o.id)}/><span><strong>{o.title}</strong></span></label>)}</div>{error&&<p className="form-error">{error}</p>}<button type="button" disabled={submitting||profileStatus!=="Сохранено"} onClick={()=>void createSubscription()}>{submitting?"Передаём менеджеру…":`Оплатить ${draft.total.toLocaleString("ru-RU")} ฿`}</button></div></div>}
    {receipt&&<PaymentDetails payment={receipt} config={paymentConfig} onClose={()=>setReceipt(null)} onChat={()=>{setReceipt(null);void openChat();}}/>}
    {termsOpen&&<div className="modal-backdrop terms-backdrop"><div className="payment-modal terms-modal"><span className="eyebrow">Правила</span><h2>Перед использованием подписки</h2><div className="terms-scroll"><p><strong>Подписка.</strong> Первый обед — не раньше следующего дня после оформления.</p><p><strong>Получение.</strong> Самовывоз или доставка с 12:00 до 18:00.</p><p><strong>Самовывоз.</strong> День списывается после успешного сканирования QR-кода выбранной точки выдачи. Повторное сканирование одной подписки в тот же день не допускается.</p><p><strong>Доставка.</strong> Если день не поставлен на паузу, после 18:00 он автоматически считается использованным.</p><p><strong>Изменение времени.</strong> Время на текущий день можно изменить до 11:30.</p></div><label className="terms-checkbox"><input type="checkbox" checked={termsChecked} onChange={e=>setTermsChecked(e.target.checked)}/><span>Я ознакомился с правилами</span></label><button disabled={!termsChecked} onClick={()=>void acceptTerms()}>Продолжить</button></div></div>}
  </main>;
}
