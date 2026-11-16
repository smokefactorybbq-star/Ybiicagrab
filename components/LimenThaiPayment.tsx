"use client";
import { useEffect, useRef, useState } from "react";
type Payment = {state:string;totalThb:number;amountRub:string|null;rate:string|null;test:boolean;activated:boolean;expiresAt:string|null;paymentUrl:string|null;qr:string|null;quoteExpiresAt?:string};
type Result = {ok:boolean;payment?:Payment;error?:string;code?:string};
const buttonStyle = {display:"block",width:"100%",padding:"16px 20px",border:0,borderRadius:16,background:"#163a32",color:"#fff",fontSize:18,fontWeight:700,cursor:"pointer",marginTop:16};
export default function LimenThaiPayment({subscriptionId,onPaid}:{subscriptionId:string;onPaid?:()=>void}) {
  const [payment,setPayment] = useState<Payment|null>(null);
  const [error,setError] = useState("");
  const [code,setCode] = useState("");
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [now,setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const alive = useRef(true);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const controller = useRef<AbortController|null>(null);

  async function request(action:"quote"|"pay"|"status",acceptedRub?:string) {
    if(inFlight.current) return;
    inFlight.current=true;
    setBusy(true);setError("");setCode("");
    const abort=new AbortController();controller.current=abort;
    try {
      const response=await fetch("/api/payments/limenthai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId,action,acceptedRub}),signal:abort.signal});
      const data:Result=await response.json();
      if(!alive.current||abort.signal.aborted)return;
      if(!response.ok||!data.ok||!data.payment){setError(data.error||"Не удалось получить сумму оплаты.");setCode(data.code||"");return;}
      const next=data.payment;
      setPayment(next);
      if(next.activated)onPaidRef.current?.();
      if(action==="pay"&&next.state==="pending"&&next.paymentUrl){
        // The provider fixes the final amount at creation. Never redirect to a
        // different amount without showing it and obtaining a second click.
        if(next.amountRub===acceptedRub){window.location.assign(next.paymentUrl);}
        else {setNotice("Обменник уточнил сумму. Проверьте её и нажмите «Оплатить».");}
      }
    } catch(e) {
      if(alive.current&&!abort.signal.aborted)setError("Сервис временно недоступен. Повторите запрос позже.");
    } finally {
      if(controller.current===abort){inFlight.current=false;if(alive.current)setBusy(false);}
    }
  }
  useEffect(()=>{
    alive.current=true;
    void request("quote");
    const clock=setInterval(()=>setNow(Date.now()),1000);
    return()=>{alive.current=false;controller.current?.abort();inFlight.current=false;clearInterval(clock);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[subscriptionId]);
  useEffect(()=>{
    if(!payment||!["creating","pending"].includes(payment.state))return;
    const timer=setInterval(()=>{void request("status");},15000);
    return()=>clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[payment?.state,subscriptionId]);
  const isNew=payment?.state==="new";
  const quoteExpired=isNew&&payment?.quoteExpiresAt?Date.parse(payment.quoteExpiresAt)<=now:false;
  const expired=payment?.expiresAt?Date.parse(payment.expiresAt)<=now:false;
  const canPay=!!payment?.amountRub&&!busy&&!expired&&!quoteExpired&&((isNew&&code!=="PRICE_CHANGED")||(payment?.state==="pending"&&!!payment.paymentUrl));
  function pay(){
    if(!canPay||!payment)return;
    if(payment.state==="pending"&&payment.paymentUrl){window.location.assign(payment.paymentUrl);return;}
    setNotice("");void request("pay",payment.amountRub!);
  }
  return <div aria-busy={busy}>
    {!payment&&busy&&<p role="status">Получаем сумму в рублях…</p>}
    {payment&&<>
      {payment.test&&<p>Тестовый режим: деньги не списываются, подписка не активируется.</p>}
      <p>{payment.totalThb.toLocaleString("ru-RU")} ฿</p>
      {payment.amountRub&&<p className="payment-amount">{Number(payment.amountRub).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2})} ₽</p>}
      {isNew&&<small>Предварительная сумма. Точную сумму обменник фиксирует при создании платежа.</small>}
      {notice&&<p role="status">{notice}</p>}
      {(isNew||payment.state==="pending")&&<button type="button" style={{...buttonStyle,opacity:canPay?1:0.55}} disabled={!canPay} onClick={pay}>{busy?"Подготавливаем оплату…":"Оплатить"}</button>}
      {payment.state==="pending"&&!expired&&<p>По кнопке «Оплатить» откроется страница СБП с выбором банка.</p>}
      {payment.state==="pending"&&!expired&&payment.qr&&<details style={{marginTop:12}}><summary>Показать QR для оплаты с другого устройства</summary><img className="bank-payment-qr" src={payment.qr} alt="QR для оплаты через СБП"/></details>}
      {payment.state==="creating"&&<p>Проверяем созданную заявку. Не создавайте повторный заказ.</p>}
      {payment.state==="paid"&&<p>{payment.test?"Тестовая оплата подтверждена.":payment.activated?"Оплата подтверждена. Подписка активирована.":"Оплата получена. Обратитесь к менеджеру."}</p>}
      {["expired","declined"].includes(payment.state)&&<p>Платёж {payment.state==="expired"?"просрочен":"отклонён"}. Обратитесь к менеджеру.</p>}
      {expired&&payment.state==="pending"&&<p>Срок оплаты истёк. Проверяем окончательный статус.</p>}
      {quoteExpired&&<p>Курс обновился. Запросите сумму ещё раз.</p>}
    </>}
    {error&&<p className="form-error" role="alert">{error}{code&&<small style={{display:"block"}}>Код для менеджера: {code}</small>}</p>}
    {(!payment||isNew||["creating","pending"].includes(payment.state))&&<button type="button" style={{...buttonStyle,background:"#ece9e0",color:"#163a32",fontSize:15}} disabled={busy} onClick={()=>{setNotice("");void request(!payment||isNew?"quote":"status");}}>{busy?"Подождите…":!payment||isNew?"Обновить сумму":"Проверить оплату"}</button>}
  </div>;
}
