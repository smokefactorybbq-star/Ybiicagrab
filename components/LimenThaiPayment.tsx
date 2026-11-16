"use client";
import {useEffect,useState} from "react";
type Payment={state:string;totalThb:number;amountRub:string|null;rate:string|null;test:boolean;activated:boolean;expiresAt:string|null;paymentUrl:string|null;qr:string|null};
export default function LimenThaiPayment({subscriptionId,onPaid}:{subscriptionId:string;onPaid?:()=>void}){
  const [payment,setPayment]=useState<Payment|null>(null),[error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    const controller=new AbortController();
    async function check(){
      try{
        const response=await fetch("/api/payments/limenthai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId}),signal:controller.signal});
        const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"Ошибка проверки платежа");
        if(stopped)return;
        setPayment(data.payment);setError("");
        if(data.payment.activated)onPaid?.();
        if(["paid","expired","declined"].includes(data.payment.state))return;
      }catch(e){if(!stopped)setError(e instanceof Error?e.message:"Не удалось проверить платёж");}
      if(!stopped)timer=setTimeout(check,15000);
    }
    void check();return()=>{stopped=true;controller.abort();clearTimeout(timer);};
    // Parent refresh callbacks must not restart payment polling on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[subscriptionId,retry]);
  const expired=payment?.expiresAt?Date.parse(payment.expiresAt)<=Date.now():false;
  return <div>
    {!payment&&<p>Запрашиваем платёж у LimenThai…</p>}
    {payment&&<>
      {payment.test&&<p className="form-error">Тестовый режим. Реальная оплата не требуется, подписка не активируется.</p>}
      <p className="payment-amount">{payment.totalThb.toLocaleString("ru-RU")} ฿</p>
      {payment.amountRub&&<p className="payment-conversion">К оплате: <strong>{payment.amountRub} ₽</strong><br/>Курс обменника: 1 ฿ = {payment.rate} ₽ (округление суммы — по правилам обменника)</p>}
      {payment.state==="pending"&&!expired&&payment.paymentUrl&&<><a href={payment.paymentUrl} target="_blank" rel="noopener noreferrer"><img className="bank-payment-qr" src={payment.qr||""} alt="Индивидуальный QR оплаты СБП"/></a><p><a href={payment.paymentUrl} target="_blank" rel="noopener noreferrer">Открыть оплату СБП</a></p></>}
      {payment.state==="paid"?<p>{payment.test?"Тестовый платёж подтверждён.":payment.activated?"Оплата подтверждена. Подписка активирована.":"Оплата получена. Обратитесь к менеджеру."}</p>:payment.state==="expired"||payment.state==="declined"?<p>Платёж {payment.state==="expired"?"просрочен":"отклонён"}. Обратитесь к менеджеру.</p>:<p>{expired?"Срок QR истёк. Проверяем статус у обменника; не оплачивайте этот QR.":"Ожидаем подтверждение оплаты. Статус проверяется автоматически."}</p>}
      {payment.expiresAt&&<small>QR действителен до {new Date(payment.expiresAt).toLocaleString("ru-RU")}</small>}
    </>}
    {error&&<p className="form-error">{error}</p>}
    <button type="button" onClick={()=>setRetry(x=>x+1)}>Проверить оплату</button>
  </div>;
}
