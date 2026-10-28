"use client";

import Link from "next/link";
import PaymentDetails, { type PaymentConfig, type PaymentReceipt } from "../../components/PaymentDetails";
import { validDeliveryTime } from "../../lib/validation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMealTemplateForDate } from "../../data/meals";
import {useCatalog} from "../../components/useCatalog";
import {priceForDates} from "../../lib/meal-prices";
import { subscriptionRules } from "../../data/subscriptionRules";

type Account = { userId:string; fullName:string; phone:string; address:string; photoUrl:string; termsAcceptedAt:string|null; telegramUsername:string };
type ChatMessage = { id:string; senderRole:"CUSTOMER"|"MANAGER"; senderName:string|null; body:string; imageUrl?:string|null; attachmentType?:"image"|"pdf"|null; createdAt:string };
type Draft = { dates:string[]; selectedDays:number; rate:number; total:number; createdAt:string; fulfillmentType:"PICKUP"|"DELIVERY"; pickupPointName?:string; pickupPointCode?:string; duplicateConfirmed?:boolean; checkoutKey?:string };
type Day = {
  service_date:string; status:string; fulfillment_type?:"PICKUP"|"DELIVERY"; requested_time?:string|null; delivery_address?:string|null;
  pickup_point_code?:string|null; pickup_point_name?:string|null;
  redeemed_at?:string|null; consumed_at?:string|null; delivery_received_at?:string|null; pickup_redeemed_point_name?:string|null;
};
type Subscription = {
  id:string; code:string|null; status:string; selected_days:number; remaining_portions:number; pause_limit:number; pauses_used:number;
  rate_thb:number; total_thb:number; starts_on:string; ends_on:string; payment_method:string|null; fulfillment_type:"PICKUP"|"DELIVERY";
  rub_rate?:number|null; pickup_point_name?:string|null; pickup_point_code?:string|null; customer_name?:string; customer_phone?:string; delivery_address?:string|null; default_time?:string|null; days:Day[];
};
type Clock = { date:string; hour:number; minute:number; isTestMode?:boolean };
type FulfillmentEditor = { subscriptionId:string; serviceDate:string; fulfillmentType:"PICKUP"|"DELIVERY"; pickupPointCode:string; requestedTime:string };

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
function addIsoDays(value:string,amount:number){const [y,m,d]=value.split("-").map(Number);return new Date(Date.UTC(y,m-1,d+amount)).toISOString().slice(0,10);}
function fallbackClock():Clock { const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()); const g=(t:string)=>p.find(x=>x.type===t)?.value||"0"; return {date:`${g("year")}-${g("month")}-${g("day")}`,hour:+g("hour"),minute:+g("minute")}; }
const validSubscriptionTime=validDeliveryTime;

export default function AccountPage(){
  const {points:pickupPoints,discounts,ready:catalogReady,error:catalogError,reload:reloadCatalog}=useCatalog();
  const [ready,setReady]=useState(false); const [account,setAccount]=useState<Account|null>(null); const [error,setError]=useState("");
  const [sessionBusy,setSessionBusy]=useState(false);
  const [telegramPreparing,setTelegramPreparing]=useState(false);
  const [telegramMiniLogin,setTelegramMiniLogin]=useState<{token:string;telegramUrl:string;botUsername:string;hasMainWebApp:boolean;miniAppUrl:string}|null>(null);
  const [draft,setDraft]=useState<Draft|null>(null); const [subscriptions,setSubscriptions]=useState<Subscription[]>([]); const [clock,setClock]=useState<Clock>(fallbackClock());
  const [name,setName]=useState(""); const [phone,setPhone]=useState(""); const [address,setAddress]=useState("");
  const [fulfillment,setFulfillment]=useState<"PICKUP"|"DELIVERY">("PICKUP"); const [requestedTime,setRequestedTime]=useState("13:30");
  const [pickupPointName,setPickupPointName]=useState("");
  const [paymentMethod,setPaymentMethod]=useState(paymentOptions[0].id); const [paymentOpen,setPaymentOpen]=useState(false); const [submitting,setSubmitting]=useState(false);
  const [checkoutProfileOpen,setCheckoutProfileOpen]=useState(false); const [checkoutProfileSaving,setCheckoutProfileSaving]=useState(false);
  const [termsOpen,setTermsOpen]=useState(false); const [termsChecked,setTermsChecked]=useState(false); const [pauseLoading,setPauseLoading]=useState("");
  const [timeLoading,setTimeLoading]=useState(""); const [fulfillmentLoading,setFulfillmentLoading]=useState("");
  const [pickupChoices,setPickupChoices]=useState<Record<string,string>>({});
  const [fulfillmentEditor,setFulfillmentEditor]=useState<FulfillmentEditor|null>(null);
  const [scanTarget,setScanTarget]=useState<Subscription|null>(null); const [scanMessage,setScanMessage]=useState(""); const [scanBusy,setScanBusy]=useState(false);
  const [chatOpen,setChatOpen]=useState(false); const [chatMessages,setChatMessages]=useState<ChatMessage[]>([]); const [chatText,setChatText]=useState("");
  const [chatUnread,setChatUnread]=useState(0); const [chatLoading,setChatLoading]=useState(false); const [chatError,setChatError]=useState(""); const [chatUnavailableHint,setChatUnavailableHint]=useState(false);
  const [paymentConfig,setPaymentConfig]=useState<PaymentConfig>({thaiQr:null,russianQr:null,rubRate:null});
  const [receipt,setReceipt]=useState<PaymentReceipt|null>(null);
  const [profileStatus,setProfileStatus]=useState("Сохранено");
  const [scannerAttempt,setScannerAttempt]=useState(0);
  const scannerGenerationRef=useRef(0); const scannerRef=useRef<any>(null); const scanLockedRef=useRef(false);

  const prepareTelegramMiniLogin=useCallback(async()=>{
    setTelegramPreparing(true);setError("");
    try{
      const response=await fetch("/api/auth/telegram/miniapp/start",{method:"POST",credentials:"same-origin",cache:"no-store"});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось подготовить вход через Telegram");
      setTelegramMiniLogin({token:String(data.token),telegramUrl:String(data.telegramUrl),botUsername:String(data.botUsername||""),hasMainWebApp:Boolean(data.hasMainWebApp),miniAppUrl:String(data.miniAppUrl||"")});
    }catch(e){setTelegramMiniLogin(null);setError(e instanceof Error?e.message:"Не удалось подготовить вход через Telegram");}
    finally{setTelegramPreparing(false);}
  },[]);

  useEffect(()=>{if(!ready||account||telegramMiniLogin||telegramPreparing)return;void prepareTelegramMiniLogin();},[ready,account,telegramMiniLogin,telegramPreparing,prepareTelegramMiniLogin]);

  useEffect(()=>{
    if(account||!telegramMiniLogin?.token)return;
    let stopped=false;
    const check=async()=>{
      try{
        const response=await fetch("/api/auth/telegram/miniapp/status",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:telegramMiniLogin.token})});
        const data=await response.json();
        if(stopped)return;
        if(response.ok&&data.state==="approved"){setSessionBusy(true);window.location.replace("/account?telegram=ok");return;}
        if(response.ok&&(data.state==="expired"||data.state==="consumed"||data.state==="missing")){setTelegramMiniLogin(null);}
      }catch{}
    };
    void check();
    const timer=window.setInterval(()=>void check(),1500);
    return()=>{stopped=true;window.clearInterval(timer);};
  },[account,telegramMiniLogin]);

  useEffect(()=>{
    if(!draft||!catalogReady)return;
    const quote=priceForDates(draft.dates,discounts);
    const point=pickupPoints.find(p=>draft.pickupPointCode?p.code===draft.pickupPointCode:p.name===draft.pickupPointName);
    if(point)setPickupPointName(point.name);
    if(draft.total!==quote.total||draft.rate!==quote.rate||point&&(draft.pickupPointName!==point.name||draft.pickupPointCode!==point.code)){
      const updated={...draft,total:quote.total,rate:quote.rate,...(point?{pickupPointName:point.name,pickupPointCode:point.code}:{})};
      setDraft(updated);localStorage.setItem("mealpoint_subscription_draft",JSON.stringify(updated));
    }
  },[draft,catalogReady,discounts,pickupPoints]);

  const loadAccount=useCallback(async()=>{
    const response=await fetch("/api/account/me",{cache:"no-store",credentials:"same-origin"});
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
        TELEGRAM_OIDC_NOT_CONFIGURED:"Telegram Web Login не настроен на сервере",
        TELEGRAM_AUTH_EXPIRED:"Подтверждение Telegram устарело. Попробуйте войти ещё раз.",
        BAD_TELEGRAM_AUTH:"Не удалось проверить вход Telegram. Попробуйте ещё раз.",
        TELEGRAM_PHONE_REQUIRED:"Для входа разрешите Telegram передать подтверждённый номер телефона.",
        TELEGRAM_PHONE_MISMATCH:"Введённый номер не совпадает с номером выбранного Telegram-аккаунта.",
        TELEGRAM_LOGIN_CANCELLED:"Вход через Telegram отменён."
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
    if(!draft)return;
    const params=new URLSearchParams(window.location.search);
    if(params.get("checkout")!=="1")return;
    const timer=window.setTimeout(()=>document.getElementById("new-subscription")?.scrollIntoView({behavior:"smooth",block:"start"}),80);
    return()=>window.clearTimeout(timer);
  },[draft]);
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
  useEffect(()=>{if(!account||!subscriptions.length)return;void loadChat(false);const timer=window.setInterval(()=>void loadChat(chatOpen),chatOpen?5000:15000);return()=>window.clearInterval(timer);},[account,subscriptions.length,chatOpen,loadChat]);
  useEffect(()=>{if(!chatUnavailableHint)return;const dismiss=()=>setChatUnavailableHint(false);window.addEventListener("pointerdown",dismiss,{once:true});return()=>window.removeEventListener("pointerdown",dismiss);},[chatUnavailableHint]);
  async function openChat(){if(!subscriptions.length){setChatUnavailableHint(true);return;}setChatUnavailableHint(false);setChatOpen(true);await loadChat(true);}
  async function sendChatMessage(){
    const text=chatText.trim();if(!text||chatLoading)return;setChatLoading(true);setChatError("");
    try{const form=new FormData();form.set("text",text);const response=await fetch("/api/account/chat",{method:"POST",credentials:"same-origin",body:form});const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{};}catch{}if(!response.ok||!data.ok)throw new Error(data.error||`Не удалось отправить сообщение (HTTP ${response.status})`);setChatText("");await loadChat(true);}catch(e){setChatError(e instanceof Error?e.message:"Не удалось отправить сообщение");}finally{setChatLoading(false);}
  }
  async function sendChatAttachment(file:File){
    if(chatLoading)return;
    if(file.size>5*1024*1024){setChatError("Размер файла — до 5 МБ");return;}
    const isPdf=file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf");
    const isImage=file.type.startsWith("image/");
    if(!isPdf&&!isImage){setChatError("Можно отправить изображение или PDF-файл");return;}
    setChatLoading(true);setChatError("");
    try{const form=new FormData();form.set("text","");form.set("file",file);const response=await fetch("/api/account/chat",{method:"POST",credentials:"same-origin",body:form});const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{};}catch{}if(!response.ok||!data.ok)throw new Error(data.error||`Не удалось отправить файл (HTTP ${response.status})`);await loadChat(true);}catch(e){setChatError(e instanceof Error?e.message:"Не удалось отправить файл");}finally{setChatLoading(false);}
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

  const exactDuplicate=useMemo(()=>draft?subscriptions.some(s=>s.status==="ACTIVE"&&s.days.map(d=>d.service_date).join("|")===draft.dates.join("|")):false,[draft,subscriptions]);
  async function acceptTerms(){ if(!termsChecked)return; const r=await fetch("/api/account/terms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true})}); const d=await r.json(); if(!r.ok||!d.ok){setError(d.error);return;} setAccount(a=>a?{...a,termsAcceptedAt:d.termsAcceptedAt}:a); setTermsOpen(false); }
  async function logout(){
    if(sessionBusy)return;setSessionBusy(true);setError("");
    try{
      const response=await fetch("/api/account/logout",{method:"POST",credentials:"same-origin"});
      const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось выйти из кабинета");
      setAccount(null);setSubscriptions([]);setChatOpen(false);setChatUnread(0);setTelegramMiniLogin(null);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось выйти из кабинета");}
    finally{setSessionBusy(false);}
  }
  async function saveCheckoutProfileAndOpenPayment(){
    const fullName=name.trim(); const contactPhone=phone.trim(); const deliveryAddress=address.trim();
    if(fullName.length<2)return setError("Введите имя");
    if(contactPhone.length<8)return setError("Введите номер телефона");
    if(fulfillment==="DELIVERY"&&deliveryAddress.length<5)return setError("Введите адрес доставки");
    setCheckoutProfileSaving(true);setError("");setProfileStatus("Сохраняем…");
    try{
      const response=await fetch("/api/account/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({fullName,phone:contactPhone,address:deliveryAddress})});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось сохранить данные клиента");
      setAccount(data.account);setName(data.account.fullName||"");setPhone(data.account.phone||"");setAddress(data.account.address||"");setProfileStatus("Сохранено");
      setCheckoutProfileOpen(false);setPaymentOpen(true);
    }catch(e){setProfileStatus("Не сохранено");setError(e instanceof Error?e.message:"Не удалось сохранить данные клиента");}
    finally{setCheckoutProfileSaving(false);}
  }
  async function createSubscription(){
    if(!catalogReady)return setError("Дождитесь загрузки актуальных цен");
    if(!draft||(fulfillment==="DELIVERY"&&!validSubscriptionTime(requestedTime)))return setError("Выберите время с 13:30 до 18:00");
    if(!account||account.fullName.trim().length<2||account.phone.trim().length<8)return setError("Заполните имя и телефон");
    if(fulfillment==="DELIVERY"&&address.trim().length<5)return setError("Введите адрес доставки");
    if(!pickupPoints.some(p=>draft.pickupPointCode?p.code===draft.pickupPointCode:p.name===pickupPointName))return setError("Выберите пункт выдачи");
    if(profileStatus!=="Сохранено")return setError("Дождитесь сохранения данных клиента");
    setSubmitting(true);setError("");
    try{ const r=await fetch("/api/subscriptions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dates:draft.dates,paymentMethod,fulfillmentType:fulfillment,address,requestedTime:fulfillment==="DELIVERY"?requestedTime:null,pickupPointName,pickupPointCode:draft.pickupPointCode,expectedTotal:draft.total,checkoutKey:draft.checkoutKey})}); const d=await r.json(); if(!r.ok||!d.ok){if(d.priceChanged)await reloadCatalog();throw new Error(d.error||"Ошибка оформления");} localStorage.removeItem("mealpoint_subscription_draft"); setReceipt({method:d.subscription.paymentMethod,total:d.subscription.total,rubRate:d.subscription.rubRate});setDraft(null);setPaymentOpen(false);await loadSubscriptions(); }
    catch(e){setError(e instanceof Error?e.message:"Ошибка оформления");}finally{setSubmitting(false);}
  }
  async function pause(id:string,date:string){setPauseLoading(`${id}:${date}`);const r=await fetch("/api/subscriptions/pause",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,serviceDate:date})});const d=await r.json();if(!r.ok||!d.ok)setError(d.error||"Ошибка паузы");else await loadSubscriptions();setPauseLoading("");}
  async function changeTime(id:string,date:string,time:string){ if(!validSubscriptionTime(time))return setError("Время должно быть с 13:30 до 18:00"); setTimeLoading(`${id}:${date}`); const r=await fetch("/api/subscriptions/schedule",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId:id,serviceDate:date,requestedTime:time})});const d=await r.json();if(!r.ok||!d.ok)setError(d.error||"Не удалось изменить время");else await loadSubscriptions();setTimeLoading(""); }
  async function changeFulfillment(id:string,date:string,type:"PICKUP"|"DELIVERY",pickupPointCode:string,time:string){
    if(type==="DELIVERY"&&address.trim().length<5){setError("Укажите адрес доставки в блоке «Данные клиента»");return false;}
    if(type==="DELIVERY"&&!validSubscriptionTime(time)){setError("Время доставки должно быть с 13:30 до 18:00");return false;}
    if(!pickupPointCode){setError("Выберите пункт выдачи");return false;}
    const key=`${id}:${date}`;setFulfillmentLoading(key);setError("");
    try{const r=await fetch("/api/subscriptions/fulfillment",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId:id,serviceDate:date,fulfillmentType:type,pickupPointCode,requestedTime:type==="DELIVERY"?time:null,deliveryAddress:type==="DELIVERY"?address.trim():null})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Не удалось изменить способ получения");await loadSubscriptions();return true;}
    catch(e){setError(e instanceof Error?e.message:"Не удалось изменить способ получения");return false;}finally{setFulfillmentLoading("");}
  }
  async function saveFulfillmentEditor(){
    if(!fulfillmentEditor)return;
    const saved=await changeFulfillment(fulfillmentEditor.subscriptionId,fulfillmentEditor.serviceDate,fulfillmentEditor.fulfillmentType,fulfillmentEditor.pickupPointCode,fulfillmentEditor.requestedTime);
    if(saved)setFulfillmentEditor(null);
  }
  function canEditDay(date:string){ if(date>clock.date)return true; if(date<clock.date)return false; return clock.hour<11; }

  if(!ready)return <main className="page-shell account-page"><section className="empty-account"><h1>Открываем личный кабинет…</h1></section></main>;
  if(!account){
    return <main className="page-shell account-page"><section className="account-login-shell"><div className="account-login-card"><span className="eyebrow">Личный кабинет</span><h1>Вход через Telegram</h1><p>MealPoint войдёт именно под тем Telegram-аккаунтом, который вы подтвердите внутри приложения Telegram. Старая web-сессия Telegram больше не используется.</p>{error&&<p className="form-error">{error}</p>}{telegramMiniLogin&&!telegramMiniLogin.hasMainWebApp&&<div className="telegram-setup-warning"><strong>Нужно один раз включить Main Mini App в BotFather.</strong><span>Для @{telegramMiniLogin.botUsername} укажите URL:</span><code>{telegramMiniLogin.miniAppUrl}</code><span>После сохранения нажмите «Обновить вход».</span></div>}{telegramMiniLogin?.hasMainWebApp?<a className="telegram-entry-button telegram-entry-link" href={telegramMiniLogin.telegramUrl} target="_blank" rel="noreferrer" onClick={()=>{setSessionBusy(false);setError("")}}>Открыть Telegram для входа</a>:<button type="button" className="telegram-entry-button" disabled={telegramPreparing} onClick={()=>void prepareTelegramMiniLogin()}>{telegramPreparing?"Проверяем Telegram…":"Обновить вход"}</button>}<p className="telegram-login-note">Если Telegram открыл не тот аккаунт, нажмите «Это не мой аккаунт», переключите аккаунт в приложении Telegram и откройте вход ещё раз. Сайт ждёт подтверждение именно выбранного Telegram ID.</p><button type="button" className="text-button telegram-login-refresh" disabled={telegramPreparing} onClick={()=>{setTelegramMiniLogin(null);}}>Создать новую ссылку входа</button><Link href="/">Вернуться к подписке</Link></div></section></main>;
  }

  return <main className="page-shell account-page">
    <section className="account-top"><div><span className="eyebrow">Личный кабинет</span><h1>Здравствуйте, {name||"клиент"}</h1><p>{account.telegramUsername?`@${account.telegramUsername}`:"Telegram"}{phone?` · ${phone}`:""}</p></div><div className="account-top-actions"><div className="account-chat-control"><button type="button" className="account-message-button" aria-label="Чат с менеджером" onClick={(event)=>{event.stopPropagation();void openChat();}}>💬{chatUnread>0&&<span className="message-alert">{Math.min(chatUnread,99)}</span>}</button>{chatUnavailableHint&&<div className="account-chat-unavailable" role="status">Чат с менеджером будет доступен после оформления заказа</div>}</div><Link className="new-subscription-link" href="/#subscription">Оформить подписку</Link><button type="button" className="text-button muted" disabled={sessionBusy} onClick={logout}>Выйти</button></div></section>
    {clock.isTestMode&&<p className="test-mode-banner">Тестовое время: {clock.date} {String(clock.hour).padStart(2,"0")}:{String(clock.minute).padStart(2,"0")}</p>}
    {catalogError&&<p className="form-error">{catalogError}</p>}
    {error&&<p className="form-error account-error">{error}</p>}
    {draft&&<section id="new-subscription" className="purchase-card purchase-card-top"><div><span className="eyebrow">Новая подписка</span><h2>{draft.selectedDays} дней неодинаковой еды</h2><p>{formatDate(draft.dates[0])} — {formatDate(draft.dates[draft.dates.length-1])}</p><div className="purchase-numbers"><strong>{draft.total.toLocaleString("ru-RU")} ฿</strong><span>{draft.selectedDays>=20?"Скидка лояльности 20%":draft.selectedDays>=7?"Скидка лояльности 10%":`${draft.rate} ฿ базовая цена за день`}</span></div></div><div className="subscription-checkout-form"><div className="fulfillment-choice-summary"><strong>{fulfillment==="PICKUP"?"Самовывоз":"Доставка"}</strong><small>{fulfillment==="PICKUP"?`Самовывоз из пункта выдачи «${pickupPointName||"точка не выбрана"}»`:`Доставка с пункта выдачи «${pickupPointName||"точка не выбрана"}»`}</small><Link href="/#subscription">Изменить способ получения</Link></div>{fulfillment==="DELIVERY"&&<label>Время доставки<input type="time" min="13:30" max="18:00" step="900" value={requestedTime} onChange={e=>setRequestedTime(e.target.value)}/></label>}<div className="checkout-customer-summary"><span>Данные клиента</span><strong>{name.trim()||"Имя не указано"}</strong><small>{phone.trim()||"Телефон не указан"}</small>{fulfillment==="DELIVERY"&&<small>{address.trim()||"Адрес доставки не указан"}</small>}</div><button type="button" className="purchase-pay-button" disabled={!catalogReady} onClick={()=>{setError("");setCheckoutProfileOpen(true)}}>Оплатить</button>{exactDuplicate&&<small className="duplicate-checkout-note">Будет оформлена ещё одна подписка на выбранные даты.</small>}</div></section>}

    <section className="account-profile-form"><div className="account-profile-heading"><div><span className="eyebrow">Данные клиента</span><h2>Контакты</h2></div><span className={`autosave-status ${profileStatus==="Сохранено"?"saved":profileStatus==="Сохраняем…"?"saving":"error"}`}>{profileStatus}</span></div><div className="profile-fields-grid"><label>Имя<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Телефон<input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+66 81 234 5678"/></label><label className="profile-address-field">Адрес доставки<textarea value={address} onChange={e=>setAddress(e.target.value)}/></label></div></section>


    {!!subscriptions.length&&<section className="subscriptions-list-section">
      <div className="subscriptions-list-heading">
        <div><span className="eyebrow">Мои подписки</span><h2>{subscriptions.length}</h2></div>
        <p>Самовывоз доступен с 13:00 до 21:00 и списывается после QR или автоматически в 21:00. Доставка — с 13:30 до 18:00.</p>
      </div>
      <div className="subscriptions-list">{subscriptions.map((s,index)=>{
        const todayDay=s.days.find(day=>day.service_date===clock.date);
        const todayFulfillment=todayDay?.fulfillment_type||s.fulfillment_type;
        const canScan=todayFulfillment==="PICKUP"&&s.status==="ACTIVE"&&Boolean(todayDay)&&!todayDay?.redeemed_at&&["PLANNED","AVAILABLE"].includes(todayDay?.status||"")&&clock.hour>=13&&clock.hour<21;
        const pickedToday=Boolean(todayDay?.redeemed_at)||todayDay?.status==="REDEEMED";
        const activeMethods=new Set(s.days.filter(day=>["PLANNED","AVAILABLE"].includes(day.status)).map(day=>day.fulfillment_type||s.fulfillment_type));
        const mixedMethods=activeMethods.size>1;
        const todayPoint=todayDay?.pickup_point_name||s.pickup_point_name||"точка не выбрана";
        const scanHint=pickedToday?"✓ Сегодня получено":s.status!=="ACTIVE"?"QR будет доступен после активации подписки":!todayDay?"Сегодня нет выбранного дня":todayFulfillment!=="PICKUP"?"Сегодня выбрана доставка":clock.hour<13?"QR будет доступен с 13:00":clock.hour>=21?"Время самовывоза завершено":"QR готов к сканированию";
        return <article className="subscription-instance" key={s.id}>
          <section className={`active-subscription-card ${s.status==="ACTIVE"?"is-active":"is-waiting"}`}>
            <div>
              <span className="eyebrow">Подписка №{subscriptions.length-index}</span><h2>{statusLabels[s.status]||s.status}</h2>
              <p>{formatDate(s.starts_on)} — {formatDate(s.ends_on)}</p>
              <p>Осталось <strong>{s.remaining_portions}</strong> из {s.selected_days} дней.</p>
              <small>{mixedMethods?"Способ получения настраивается отдельно по дням":s.fulfillment_type==="DELIVERY"?"Доставка":`Самовывоз · ${s.pickup_point_name||"точка не выбрана"}`}</small>
              <small>Пауз использовано: {s.pauses_used} из {s.pause_limit}</small>
              {s.status==="AWAITING_ACTIVATION"&&<button type="button" onClick={()=>setReceipt({method:s.payment_method||"CASH",total:s.total_thb,rubRate:s.rub_rate?Number(s.rub_rate):null})}>Реквизиты для оплаты</button>}
            </div>
            <div className="subscription-pickup-scan-actions"><small>{todayFulfillment==="PICKUP"?todayPoint:"QR самовывоза"}</small><span className={pickedToday?"pickup-today-success":"subscription-scan-hint"}>{scanHint}</span><button type="button" className="pickup-scan-button" disabled={!canScan} onClick={()=>{setScanMessage("");setScanTarget(s)}}>Сканировать QR</button></div>
          </section>
          {s.status==="ACTIVE"&&<details className="subscription-details" open={index===0}>
            <summary>Дни, получение, время и пауза</summary>
            <section className="history-card"><div className="history-list subscription-meal-history">{s.days.map(day=>{
              const meal=getMealTemplateForDate(day.service_date);
              const editable=canEditDay(day.service_date)&&["PLANNED","AVAILABLE"].includes(day.status);
              const loading=`${s.id}:${day.service_date}`;
              const dayFulfillment=day.fulfillment_type||s.fulfillment_type;
              const selectedPointCode=day.pickup_point_code||s.pickup_point_code||"";
              const selectedPointName=day.pickup_point_name||s.pickup_point_name||pickupPoints.find(p=>p.code===selectedPointCode)?.name||"точка не выбрана";
              const dayTime=day.requested_time||s.default_time||"13:30";
              const canPause=day.service_date===addIsoDays(clock.date,1)&&clock.hour<20&&s.pause_limit>s.pauses_used&&["PLANNED","AVAILABLE"].includes(day.status);
              return <div key={day.service_date}>
                <time>{formatDate(day.service_date)}</time>
                <span className="history-meal-name"><strong>{meal.title}</strong><small>{statusLabels[day.status]||day.status}{day.pickup_redeemed_point_name?` · ${day.pickup_redeemed_point_name}`:""}</small></span>
                <span className="meal-day-actions"><span className="day-fulfillment-summary"><strong>{dayFulfillment==="DELIVERY"?`Доставка с пункта выдачи «${selectedPointName}»`:`Самовывоз из пункта выдачи «${selectedPointName}»`}</strong>{dayFulfillment==="DELIVERY"&&<small>Время: {dayTime}</small>}</span>{editable&&<button type="button" className="day-edit-button" disabled={fulfillmentLoading===loading} onClick={()=>setFulfillmentEditor({subscriptionId:s.id,serviceDate:day.service_date,fulfillmentType:dayFulfillment,pickupPointCode:selectedPointCode||pickupPoints[0]?.code||"",requestedTime:dayTime})}>Внести изменения</button>}{canPause&&<button type="button" disabled={pauseLoading===loading} onClick={()=>void pause(s.id,day.service_date)}>{pauseLoading===loading?"Пауза…":"Поставить на паузу"}</button>}</span>
              </div>})}</div></section>
            <p className="subscription-cutoff-note">Время доставки и способ получения на сегодня можно изменить до 11:00. Будущие дни можно менять заранее. Паузу можно поставить только на завтра до 20:00.</p>
          </details>}
        </article>})}</div>
    </section>}

    {!draft&&!subscriptions.length&&<section className="empty-account"><h1>Подписок пока нет</h1><p>Выберите дни и блюда в разделе меню подписки.</p><Link href="/#subscription">Открыть подписку</Link></section>}

    {fulfillmentEditor&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target&&!fulfillmentLoading)setFulfillmentEditor(null)}}><section className="payment-modal day-fulfillment-modal" role="dialog" aria-modal="true"><button type="button" className="modal-close" aria-label="Закрыть" disabled={Boolean(fulfillmentLoading)} onClick={()=>setFulfillmentEditor(null)}>×</button><span className="eyebrow">Получение</span><h2>Внести изменения</h2><p>{formatDate(fulfillmentEditor.serviceDate)}</p><div className="fulfillment-switch"><button type="button" className={fulfillmentEditor.fulfillmentType==="DELIVERY"?"selected":""} onClick={()=>setFulfillmentEditor(current=>current?{...current,fulfillmentType:"DELIVERY"}:current)}>Доставка</button><button type="button" className={fulfillmentEditor.fulfillmentType==="PICKUP"?"selected":""} onClick={()=>setFulfillmentEditor(current=>current?{...current,fulfillmentType:"PICKUP"}:current)}>Самовывоз</button></div><label>Пункт выдачи<select value={fulfillmentEditor.pickupPointCode} onChange={e=>setFulfillmentEditor(current=>current?{...current,pickupPointCode:e.target.value}:current)}>{pickupPoints.map(point=><option key={point.code} value={point.code}>{point.shortName} — {point.address}</option>)}</select></label>{fulfillmentEditor.fulfillmentType==="DELIVERY"&&<label>Время доставки<input type="time" min="13:30" max="18:00" step="900" value={fulfillmentEditor.requestedTime} onChange={e=>setFulfillmentEditor(current=>current?{...current,requestedTime:e.target.value}:current)}/></label>}<button type="button" className="day-fulfillment-save" disabled={Boolean(fulfillmentLoading)||!fulfillmentEditor.pickupPointCode} onClick={()=>void saveFulfillmentEditor()}>{fulfillmentLoading?"Сохраняем…":"Сохранить изменения"}</button></section></div>}

    {chatOpen&&<div className="modal-backdrop chat-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)setChatOpen(false)}}><section className="chat-window" role="dialog" aria-modal="true"><header className="chat-header"><div><span className="eyebrow">MealPoint</span><h2>Чат с менеджером</h2></div><button type="button" className="chat-close" onClick={()=>setChatOpen(false)}>×</button></header><div className="chat-messages">{!chatMessages.length&&<p className="chat-empty">Напишите менеджеру — история сообщений сохранится здесь.</p>}{chatMessages.map(message=><article key={message.id} className={`chat-bubble ${message.senderRole==="CUSTOMER"?"chat-own":"chat-other"}`}><strong>{message.senderRole==="CUSTOMER"?"Вы":(message.senderName||"Менеджер")}</strong>{message.body&&<p>{message.body}</p>}{message.imageUrl&&message.attachmentType==="pdf"?<a className="chat-file-link" href={message.imageUrl} target="_blank" rel="noreferrer">📄 Открыть PDF</a>:message.imageUrl&&<a href={message.imageUrl} target="_blank" rel="noreferrer"><img className="chat-image" src={message.imageUrl} alt="Изображение в чате" loading="lazy"/></a>}<time>{new Date(message.createdAt).toLocaleString("ru-RU",{timeZone:"Asia/Bangkok"})}</time></article>)}</div>{chatError&&<p className="form-error chat-error">{chatError}</p>}<div className="chat-attachment"><label>{chatLoading?"⏳ Отправляем файл…":"📎 Отправить фото или PDF"}<input type="file" accept="image/*,application/pdf,.pdf" disabled={chatLoading} onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value="";if(f)void sendChatAttachment(f);}}/></label></div><div className="chat-composer"><textarea value={chatText} onChange={e=>setChatText(e.target.value)} maxLength={4000} placeholder="Напишите сообщение…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void sendChatMessage();}}}/><button type="button" disabled={chatLoading||!chatText.trim()} onClick={()=>void sendChatMessage()}>{chatLoading?"Отправляем…":"Отправить"}</button></div></section></div>}
    {scanTarget&&<div className="modal-backdrop qr-customer-backdrop"><section className="payment-modal customer-qr-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={()=>{void stopScanner();setScanTarget(null)}}>×</button><span className="eyebrow">Самовывоз</span><h2>Сканировать QR точки</h2><p>{scanTarget.days.find(day=>day.service_date===clock.date)?.pickup_point_name||scanTarget.pickup_point_name||"MealPoint"}. Сканирование можно выполнить только один раз за сегодняшний день.</p><div id="pickup-qr-reader" className="customer-qr-reader"/><p className={scanMessage==="Ошибка чтения QR"?"form-error qr-scan-message":"qr-scan-message"}>{scanMessage}</p><button type="button" disabled={scanBusy} onClick={()=>setScannerAttempt(n=>n+1)}>Включить камеру снова</button><label className="scanner-file-button customer-file-scan">Выбрать фото QR<input type="file" accept="image/*" capture="environment" disabled={scanBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void scanFile(file);e.currentTarget.value=""}}/></label><button type="button" className="text-button muted" onClick={()=>{void stopScanner();setScanTarget(null)}}>Закрыть</button></section></div>}
    {checkoutProfileOpen&&draft&&<div className="modal-backdrop checkout-profile-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target&&!checkoutProfileSaving)setCheckoutProfileOpen(false)}}><div className="payment-modal checkout-profile-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-profile-title"><button className="modal-close" type="button" aria-label="Закрыть" disabled={checkoutProfileSaving} onClick={()=>setCheckoutProfileOpen(false)}>×</button><span className="eyebrow">Данные клиента</span><h2 id="checkout-profile-title">Проверьте данные перед оплатой</h2><p>Эти данные сохранятся в блоке «Данные клиента» личного кабинета.</p><label>Имя<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" placeholder="Ваше имя"/></label><label>Номер телефона<input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+66 81 234 5678"/></label>{fulfillment==="DELIVERY"?<label>Адрес доставки<textarea value={address} onChange={e=>setAddress(e.target.value)} autoComplete="street-address" placeholder="Адрес доставки"/></label>:<div className="checkout-pickup-summary"><span>Самовывоз</span><strong>{pickupPointName||draft.pickupPointName||"Точка не выбрана"}</strong><small>Адрес клиента для самовывоза не требуется.</small></div>}{error&&<p className="form-error">{error}</p>}<button type="button" className="checkout-profile-pay-button" disabled={checkoutProfileSaving||!catalogReady} onClick={()=>void saveCheckoutProfileAndOpenPayment()}>{checkoutProfileSaving?"Сохраняем данные…":`Оплатить ${draft.total.toLocaleString("ru-RU")} ฿`}</button></div></div>}
    {paymentOpen&&draft&&<div className="modal-backdrop"><div className="payment-modal"><button className="modal-close" onClick={()=>setPaymentOpen(false)}>×</button><span className="eyebrow">Оплата подписки</span><h2>Выберите способ оплаты</h2><div className="payment-options">{paymentOptions.map(o=><label key={o.id} className={paymentMethod===o.id?"selected":""}><input type="radio" checked={paymentMethod===o.id} onChange={()=>setPaymentMethod(o.id)}/><span><strong>{o.title}</strong></span></label>)}</div>{error&&<p className="form-error">{error}</p>}<button type="button" disabled={submitting||profileStatus!=="Сохранено"||!catalogReady} onClick={()=>void createSubscription()}>{submitting?"Передаём менеджеру…":`Оплатить ${draft.total.toLocaleString("ru-RU")} ฿`}</button></div></div>}
    {receipt&&<PaymentDetails payment={receipt} config={paymentConfig} onClose={()=>setReceipt(null)} onChat={()=>{setReceipt(null);void openChat();}}/>}
    {termsOpen&&<div className="modal-backdrop terms-backdrop"><div className="payment-modal terms-modal"><span className="eyebrow">Правила</span><h2>Перед использованием подписки</h2><div className="terms-scroll">{subscriptionRules.map((rule,index)=><p key={`${rule.title}-${index}`}><strong>{rule.title}.</strong> {rule.text}</p>)}</div><label className="terms-checkbox"><input type="checkbox" checked={termsChecked} onChange={e=>setTermsChecked(e.target.checked)}/><span>Я ознакомился с правилами</span></label><button disabled={!termsChecked} onClick={()=>void acceptTerms()}>Продолжить</button></div></div>}
  </main>;
}
