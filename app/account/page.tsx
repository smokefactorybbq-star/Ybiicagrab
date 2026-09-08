"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMealTemplateForDate } from "../../data/meals";
import { pickupPoints } from "../../data/pickupPoints";

type Account = { userId:string; fullName:string; phone:string; address:string; photoUrl:string; termsAcceptedAt:string|null };
type Draft = { dates:string[]; selectedDays:number; rate:number; total:number; createdAt:string; fulfillmentType:"PICKUP"|"DELIVERY"; pickupPointName?:string; duplicateConfirmed?:boolean };
type Day = {
  service_date:string; status:string; fulfillment_type?:"PICKUP"|"DELIVERY"; requested_time?:string|null; delivery_address?:string|null;
  redeemed_at?:string|null; consumed_at?:string|null; delivery_received_at?:string|null; pickup_redeemed_point_name?:string|null;
};
type Subscription = {
  id:string; code:string|null; status:string; selected_days:number; remaining_portions:number; pause_limit:number; pauses_used:number;
  rate_thb:number; total_thb:number; starts_on:string; ends_on:string; payment_method:string|null; fulfillment_type:"PICKUP"|"DELIVERY";
  pickup_point_name?:string|null; customer_name?:string; customer_phone?:string; delivery_address?:string|null; default_time?:string|null; days:Day[];
};
type Clock = { date:string; hour:number; minute:number; isTestMode?:boolean };

const paymentOptions = [
  {id:"PROMPTPAY",title:"PromptPay / Thai bank"},
  {id:"TRUEMONEY",title:"TrueMoney"},
  {id:"BANK_RU",title:"Банк РФ"}
];
const statusLabels:Record<string,string> = {
  AWAITING_ACTIVATION:"Оплата проверяется",ACTIVE:"Активна",COMPLETED:"Завершена",CANCELLED:"Отменена",
  PLANNED:"Запланировано",AVAILABLE:"Активный день",PAUSED:"Пауза",PAUSE_REQUESTED:"Пауза",MISSED:"Использован",REDEEMED:"Получен"
};
function formatDate(value:string){ const m=value.match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m)return value; return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3],12))); }
function fallbackClock():Clock { const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()); const g=(t:string)=>p.find(x=>x.type===t)?.value||"0"; return {date:`${g("year")}-${g("month")}-${g("day")}`,hour:+g("hour"),minute:+g("minute")}; }
function validSubscriptionTime(v:string){ if(!/^\d{2}:\d{2}$/.test(v))return false; const [h,m]=v.split(":").map(Number); const n=h*60+m; return n>=720&&n<=1080; }

function PhoneLogin({onSuccess}:{onSuccess:()=>void}) {
  const [phone,setPhone]=useState("+66");
  const [code,setCode]=useState("");
  const [step,setStep]=useState<"PHONE"|"CODE">("PHONE");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [debugCode,setDebugCode]=useState("");

  async function requestCode(){
    setLoading(true);setMessage("");setDebugCode("");
    try{
      const response=await fetch("/api/auth/phone/request-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось отправить код");
      setPhone(data.phone||phone);setStep("CODE");setDebugCode(data.debugCode||"");setMessage("Код отправлен на указанный номер.");
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось отправить код");}
    finally{setLoading(false);}
  }

  async function verifyCode(){
    setLoading(true);setMessage("");
    try{
      const response=await fetch("/api/auth/phone/verify-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone,code})});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||"Неверный код");
      onSuccess();
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось выполнить вход");}
    finally{setLoading(false);}
  }

  return <div className="phone-login-box">
    <label>Номер телефона<input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+66 81 234 5678" disabled={step==="CODE"}/></label>
    {step==="CODE"&&<label>Код из SMS<input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6}/></label>}
    {message&&<p className={message.includes("отправлен")?"phone-login-message":"form-error"}>{message}</p>}
    {debugCode&&<p className="phone-login-dev-code">Тестовый код: <strong>{debugCode}</strong></p>}
    {step==="PHONE"?<button type="button" disabled={loading||phone.trim().length<8} onClick={()=>void requestCode()}>{loading?"Отправляем…":"Получить код"}</button>:<>
      <button type="button" disabled={loading||code.length!==6} onClick={()=>void verifyCode()}>{loading?"Проверяем…":"Войти / зарегистрироваться"}</button>
      <button type="button" className="phone-change-button" onClick={()=>{setStep("PHONE");setCode("");setMessage("");setDebugCode("")}}>Изменить номер</button>
    </>}
  </div>;
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
  const scannerRef=useRef<any>(null); const scanLockedRef=useRef(false);

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
      const latestPickup=(data.subscriptions as Subscription[]).find(s=>s.fulfillment_type==="PICKUP"&&pickupPoints.some(p=>p.name===s.pickup_point_name));
      if(latestPickup?.pickup_point_name)setPickupPointName(latestPickup.pickup_point_name);
    } else setError(data.error||"Ошибка подписок");
  },[account]);
  const reloadAfterPhone=useCallback(()=>{setReady(false);void loadAccount();},[loadAccount]);

  useEffect(()=>{ const raw=localStorage.getItem("mealpoint_subscription_draft"); if(raw)try{const parsed=JSON.parse(raw) as Draft;setDraft(parsed);setFulfillment(parsed.fulfillmentType||"PICKUP");if(parsed.pickupPointName)setPickupPointName(parsed.pickupPointName);}catch{localStorage.removeItem("mealpoint_subscription_draft");} void loadAccount(); void fetch("/api/app-time",{cache:"no-store"}).then(r=>r.json()).then(d=>d.ok&&setClock(d.clock)); },[loadAccount]);
  useEffect(()=>{if(account)void loadSubscriptions();},[account,loadSubscriptions]);
  useEffect(()=>{ if(!account)return; const payload={fullName:name.trim(),phone:phone.trim(),address:address.trim()}; if(payload.fullName.length<2||payload.phone.length<8)return; const timer=setTimeout(()=>{void fetch("/api/account/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).catch(()=>undefined);},800); return()=>clearTimeout(timer); },[account,name,phone,address]);

  const stopScanner=useCallback(async()=>{ const scanner=scannerRef.current; scannerRef.current=null; if(scanner){ try{await scanner.stop();}catch{} try{await scanner.clear();}catch{} } },[]);
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
    if(!scanTarget)return; let cancelled=false; setScanMessage("Открываем камеру…");
    void import("html5-qrcode").then(async({Html5Qrcode})=>{
      if(cancelled)return; const scanner=new Html5Qrcode("pickup-qr-reader"); scannerRef.current=scanner;
      try{ await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:250,height:250}},decoded=>{void redeemQr(scanTarget,decoded)},()=>undefined); if(!cancelled)setScanMessage("Наведите камеру на QR-код пункта выдачи"); }
      catch{ if(!cancelled)setScanMessage("Не удалось открыть камеру. Разрешите доступ или выберите фотографию QR."); }
    }).catch(()=>setScanMessage("Сканер QR недоступен"));
    return()=>{cancelled=true;void stopScanner();};
  },[scanTarget,redeemQr,stopScanner]);
  async function scanFile(file:File){
    if(!scanTarget)return; setScanBusy(true); setScanMessage("Читаем QR с фотографии…");
    try{ await stopScanner(); const {Html5Qrcode}=await import("html5-qrcode"); const scanner=new Html5Qrcode("pickup-qr-reader"); scannerRef.current=scanner; const decoded=await scanner.scanFile(file,true); await scanner.clear(); scannerRef.current=null; await redeemQr(scanTarget,decoded); }
    catch{setScanMessage("Ошибка чтения QR");setScanBusy(false);}
  }

  const exactDuplicate=useMemo(()=>draft?subscriptions.some(s=>s.status==="ACTIVE"&&s.days.map(d=>d.service_date).join("|")===draft.dates.join("|")):false,[draft,subscriptions]);
  async function acceptTerms(){ if(!termsChecked)return; const r=await fetch("/api/account/terms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true})}); const d=await r.json(); if(!r.ok||!d.ok){setError(d.error);return;} setAccount(a=>a?{...a,termsAcceptedAt:d.termsAcceptedAt}:a); setTermsOpen(false); }
  async function logout(){await fetch("/api/account/logout",{method:"POST"});setAccount(null);setSubscriptions([]);}
  async function createSubscription(){
    if(!draft||!validSubscriptionTime(requestedTime))return setError("Выберите время с 12:00 до 18:00");
    if(name.trim().length<2||phone.trim().length<8)return setError("Заполните имя и телефон");
    if(fulfillment==="DELIVERY"&&address.trim().length<5)return setError("Введите адрес доставки");
    if(fulfillment==="PICKUP"&&!pickupPoints.some(p=>p.name===pickupPointName))return setError("Выберите пункт самовывоза");
    setSubmitting(true);setError("");
    try{ const r=await fetch("/api/subscriptions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dates:draft.dates,paymentMethod,fulfillmentType:fulfillment,customerName:name,phone,address,requestedTime,pickupPointName})}); const d=await r.json(); if(!r.ok||!d.ok)throw new Error(d.error||"Ошибка оформления"); localStorage.removeItem("mealpoint_subscription_draft"); setDraft(null);setPaymentOpen(false);await loadSubscriptions(); }
    catch(e){setError(e instanceof Error?e.message:"Ошибка оформления");}finally{setSubmitting(false);}
  }
  async function pause(id:string,date:string){setPauseLoading(`${id}:${date}`);const r=await fetch("/api/subscriptions/pause",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,serviceDate:date})});const d=await r.json();if(!r.ok||!d.ok)setError(d.error||"Ошибка паузы");else await loadSubscriptions();setPauseLoading("");}
  async function changeTime(id:string,date:string,time:string){ if(!validSubscriptionTime(time))return setError("Время должно быть с 12:00 до 18:00"); setTimeLoading(`${id}:${date}`); const r=await fetch("/api/subscriptions/schedule",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId:id,serviceDate:date,requestedTime:time})});const d=await r.json();if(!r.ok||!d.ok)setError(d.error||"Не удалось изменить время");else await loadSubscriptions();setTimeLoading(""); }
  function canEditDay(date:string){ if(date>clock.date)return true; if(date<clock.date)return false; return clock.hour<11||(clock.hour===11&&clock.minute<30); }

  if(!ready)return <main className="page-shell account-page"><section className="empty-account"><h1>Открываем личный кабинет…</h1></section></main>;
  if(!account)return <main className="page-shell account-page"><section className="account-login-shell"><div className="account-login-card"><span className="eyebrow">Личный кабинет</span><h1>Вход и регистрация по телефону</h1><p>Введите номер телефона и код из SMS. После входа вы сможете оплатить подписку и использовать QR при получении еды.</p>{error&&<p className="form-error">{error}</p>}<PhoneLogin onSuccess={reloadAfterPhone}/><Link href="/">Вернуться к подписке</Link></div></section></main>;

  return <main className="page-shell account-page">
    <section className="account-top"><div><span className="eyebrow">Личный кабинет</span><h1>Здравствуйте, {name||"клиент"}</h1><p>{account.phone}</p></div><div className="account-top-actions"><Link className="new-subscription-link" href="/#subscription">Оформить подписку</Link><button type="button" className="text-button muted" onClick={logout}>Выйти</button></div></section>
    {clock.isTestMode&&<p className="test-mode-banner">Тестовое время: {clock.date} {String(clock.hour).padStart(2,"0")}:{String(clock.minute).padStart(2,"0")}</p>}
    {error&&<p className="form-error account-error">{error}</p>}
    <section className="account-profile-form"><div className="account-profile-heading"><div><span className="eyebrow">Данные клиента</span><h2>Контакты</h2></div><span className="autosave-status saved">Сохраняются автоматически</span></div><div className="profile-fields-grid"><label>Имя<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Телефон<input value={phone} readOnly aria-readonly="true"/></label><label className="profile-address-field">Адрес доставки<textarea value={address} onChange={e=>setAddress(e.target.value)}/></label></div></section>

    {draft&&<section className="purchase-card"><div><span className="eyebrow">Новая подписка</span><h2>{draft.selectedDays} дней неодинаковой еды</h2><p>{formatDate(draft.dates[0])} — {formatDate(draft.dates[draft.dates.length-1])}</p><div className="purchase-numbers"><strong>{draft.total.toLocaleString("ru-RU")} ฿</strong><span>{draft.rate} ฿ за день</span></div></div><div className="subscription-checkout-form"><div className="fulfillment-choice-summary"><strong>{fulfillment==="PICKUP"?"Самовывоз":"Доставка"}</strong><small>{fulfillment==="PICKUP"?(pickupPointName||"Точка не выбрана"):"По адресу клиента"}</small><Link href="/#subscription">Изменить способ получения</Link></div><label>Имя<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Телефон<input value={phone} readOnly aria-readonly="true"/></label>{fulfillment==="DELIVERY"&&<label>Адрес доставки<textarea value={address} onChange={e=>setAddress(e.target.value)}/></label>}<label>Время {fulfillment==="PICKUP"?"самовывоза":"доставки"}<input type="time" min="12:00" max="18:00" step="900" value={requestedTime} onChange={e=>setRequestedTime(e.target.value)}/></label><button type="button" onClick={()=>setPaymentOpen(true)}>{exactDuplicate?"Оформить ещё одну подписку":"Перейти к оплате"}</button></div></section>}

    {!!subscriptions.length&&<section className="subscriptions-list-section"><div className="subscriptions-list-heading"><div><span className="eyebrow">Мои подписки</span><h2>{subscriptions.length}</h2></div><p>Самовывоз: день списывается после успешного сканирования QR на точке. Доставка: день списывается автоматически после 18:00.</p></div><div className="subscriptions-list">{subscriptions.map((s,index)=>{
      const todayDay=s.days.find(day=>day.service_date===clock.date); const canScan=s.fulfillment_type==="PICKUP"&&s.status==="ACTIVE"&&Boolean(todayDay)&&["PLANNED","AVAILABLE"].includes(todayDay?.status||"")&&clock.hour<22; const pickedToday=Boolean(todayDay?.redeemed_at)||todayDay?.status==="REDEEMED";
      return <article className="subscription-instance" key={s.id}><section className={`active-subscription-card ${s.status==="ACTIVE"?"is-active":"is-waiting"}`}><div><span className="eyebrow">Подписка №{subscriptions.length-index}</span><h2>{statusLabels[s.status]||s.status}</h2><p>{formatDate(s.starts_on)} — {formatDate(s.ends_on)}</p><p>Осталось <strong>{s.remaining_portions}</strong> из {s.selected_days} дней.</p><small>{s.fulfillment_type==="DELIVERY"?"Доставка":`Самовывоз · ${s.pickup_point_name||"точка не выбрана"}`}</small></div>{s.fulfillment_type==="PICKUP"&&<div className="subscription-pickup-scan-actions">{pickedToday?<span className="pickup-today-success">✓ Сегодня получено</span>:<button type="button" className="pickup-scan-button" disabled={!canScan} onClick={()=>{setScanMessage("");setScanTarget(s)}}>Сканировать QR</button>}{!todayDay&&s.status==="ACTIVE"&&<small>QR активен только в выбранный день</small>}</div>}</section>{s.status==="ACTIVE"&&<details className="subscription-details" open={index===0}><summary>Дни, время и пауза</summary><section className="history-card"><div className="history-list subscription-meal-history">{s.days.map(day=>{const meal=getMealTemplateForDate(day.service_date);const editable=canEditDay(day.service_date)&&["PLANNED","AVAILABLE"].includes(day.status);const loading=`${s.id}:${day.service_date}`;return <div key={day.service_date}><time>{formatDate(day.service_date)}</time><span className="history-meal-name"><strong>{meal.title}</strong><small>{statusLabels[day.status]||day.status}{day.pickup_redeemed_point_name?` · ${day.pickup_redeemed_point_name}`:""}</small></span><span className="meal-day-actions">{editable?<><input type="time" min="12:00" max="18:00" step="900" defaultValue={day.requested_time||s.default_time||"13:00"} onBlur={e=>{if(e.target.value&&e.target.value!==(day.requested_time||s.default_time))void changeTime(s.id,day.service_date,e.target.value)}} disabled={timeLoading===loading}/><button type="button" disabled={pauseLoading===loading||s.pause_limit<=s.pauses_used} onClick={()=>void pause(s.id,day.service_date)}>{pauseLoading===loading?"Пауза…":"Поставить на паузу"}</button></>:<em>{day.requested_time||s.default_time||"—"}</em>}</span></div>})}</div></section><p className="subscription-cutoff-note">Время на текущий день можно изменить до 11:30. После 11:30 меняется только следующий или более поздний день.</p></details>}</article>})}</div></section>}

    {!draft&&!subscriptions.length&&<section className="empty-account"><h1>Подписок пока нет</h1><p>Выберите дни и блюда в разделе меню подписки.</p><Link href="/#subscription">Открыть подписку</Link></section>}

    {scanTarget&&<div className="modal-backdrop qr-customer-backdrop"><section className="payment-modal customer-qr-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={()=>{void stopScanner();setScanTarget(null)}}>×</button><span className="eyebrow">Самовывоз</span><h2>Сканировать QR точки</h2><p>{scanTarget.pickup_point_name||"MealPoint"}. Сканирование можно выполнить только один раз за сегодняшний день.</p><div id="pickup-qr-reader" className="customer-qr-reader"/><p className={scanMessage==="Ошибка чтения QR"?"form-error qr-scan-message":"qr-scan-message"}>{scanMessage}</p><label className="scanner-file-button customer-file-scan">Выбрать фото QR<input type="file" accept="image/*" capture="environment" disabled={scanBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void scanFile(file);e.currentTarget.value=""}}/></label><button type="button" className="text-button muted" onClick={()=>{void stopScanner();setScanTarget(null)}}>Закрыть</button></section></div>}
    {paymentOpen&&draft&&<div className="modal-backdrop"><div className="payment-modal"><button className="modal-close" onClick={()=>setPaymentOpen(false)}>×</button><span className="eyebrow">Оплата подписки</span><h2>Выберите способ оплаты</h2><div className="payment-options">{paymentOptions.map(o=><label key={o.id} className={paymentMethod===o.id?"selected":""}><input type="radio" checked={paymentMethod===o.id} onChange={()=>setPaymentMethod(o.id)}/><span><strong>{o.title}</strong></span></label>)}</div><button type="button" disabled={submitting} onClick={()=>void createSubscription()}>{submitting?"Передаём менеджеру…":`Я оплатил ${draft.total.toLocaleString("ru-RU")} ฿`}</button></div></div>}
    {termsOpen&&<div className="modal-backdrop terms-backdrop"><div className="payment-modal terms-modal"><span className="eyebrow">Правила</span><h2>Перед использованием подписки</h2><div className="terms-scroll"><p><strong>Подписка.</strong> Первый обед — не раньше следующего дня после оформления.</p><p><strong>Получение.</strong> Самовывоз или доставка с 12:00 до 18:00.</p><p><strong>Самовывоз.</strong> День списывается после успешного сканирования QR-кода выбранной точки выдачи. Повторное сканирование одной подписки в тот же день не допускается.</p><p><strong>Доставка.</strong> Если день не поставлен на паузу, после 18:00 он автоматически считается использованным.</p><p><strong>Изменение времени.</strong> Время на текущий день можно изменить до 11:30.</p></div><label className="terms-checkbox"><input type="checkbox" checked={termsChecked} onChange={e=>setTermsChecked(e.target.checked)}/><span>Я ознакомился с правилами</span></label><button disabled={!termsChecked} onClick={()=>void acceptTerms()}>Продолжить</button></div></div>}
  </main>;
}
