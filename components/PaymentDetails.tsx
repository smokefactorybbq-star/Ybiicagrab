"use client";
export type PaymentConfig = {thaiQr:string|null;russianQr:string|null;rubRate:number|null};
export type PaymentReceipt = {method:string;total:number;rubRate?:number|null};
export default function PaymentDetails({payment,config,onClose,onChat}:{payment:PaymentReceipt;config:PaymentConfig;onClose:()=>void;onChat:()=>void}){
  const title=payment.method==="CASH"?"Cash · наличные":payment.method==="BANK_RU"?"Банк РФ":"PromptPay";
  const qr=payment.method==="BANK_RU"?config.russianQr:payment.method==="PROMPTPAY"?config.thaiQr:null;
  const rate=payment.rubRate??config.rubRate;
  const money=(n:number)=>n.toLocaleString("ru-RU",{maximumFractionDigits:2});
  return <div className="modal-backdrop"><section className="payment-modal payment-details" role="dialog" aria-modal="true" aria-labelledby="payment-title"><button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>×</button><span className="eyebrow">Оплата подписки</span><h2 id="payment-title">{title}</h2>
    {qr&&<a href={qr} target="_blank" rel="noreferrer" aria-label="Открыть QR в полном размере"><img className="bank-payment-qr" src={qr} alt={`QR для оплаты — ${title}`}/></a>}
    {["PROMPTPAY","BANK_RU"].includes(payment.method)&&!qr&&<p className="form-error">Реквизиты ещё не настроены. Напишите менеджеру.</p>}
    <p className="payment-amount">{money(payment.total)} ฿</p>
    {payment.method==="BANK_RU"&&(rate?<p className="payment-conversion">{money(payment.total)} ฿ × {money(rate)} ₽/฿ = <strong>{money(Math.round(payment.total*rate*100)/100)} ₽</strong></p>:<p className="form-error">Курс ещё не настроен. Уточните сумму у менеджера.</p>)}
    <p>{payment.method==="CASH"?"Согласуйте с менеджером передачу наличных. Подписка станет активной после подтверждения оплаты.":"После оплаты пришлите чек в чат с менеджером из личного кабинета."}</p>
    <button type="button" onClick={onChat}>Открыть чат с менеджером</button><small>Подписку активирует менеджер после проверки оплаты.</small>
  </section></div>;
}
