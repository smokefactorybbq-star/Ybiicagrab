"use client";

import {Translated,useLanguage} from "./LanguageProvider";
import {getLocale} from "../lib/i18n/translate";
import LimenThaiPayment from "./LimenThaiPayment";
export type PaymentConfig = {thaiQr:string|null;russianQr:string|null;rubRate:number|null};
export type PaymentReceipt = {method:string;total:number;rubRate?:number|null;subscriptionId?:string;limenThai?:boolean};
export default function PaymentDetails({payment,config,onClose,onChat,onPaid}:{payment:PaymentReceipt;config:PaymentConfig;onClose:()=>void;onChat:()=>void;onPaid?:()=>void}){
  const {t,language}=useLanguage();

  const title=payment.method==="CASH"?"Cash · наличные":payment.method==="BANK_RU"?"Банк РФ":"PromptPay";
  const qr=payment.method==="BANK_RU"?config.russianQr:payment.method==="PROMPTPAY"?config.thaiQr:null;
  const rate=payment.rubRate??config.rubRate;
  const money=(n:number)=>n.toLocaleString(getLocale(),{maximumFractionDigits:2});
  return <div className="modal-backdrop"><section className="payment-modal payment-details" role="dialog" aria-modal="true" aria-labelledby="payment-title"><button type="button" className="modal-close" aria-label={t("Закрыть")} onClick={onClose}>×</button><span className="eyebrow"><Translated>{"Оплата подписки"}</Translated></span><h2 id="payment-title"><Translated>{title}</Translated></h2>
    {payment.method==="BANK_RU"&&payment.limenThai&&payment.subscriptionId?<><LimenThaiPayment key={payment.subscriptionId} subscriptionId={payment.subscriptionId} onPaid={onPaid}/><button type="button" onClick={onChat}><Translated>{"Открыть чат с менеджером"}</Translated></button></>:<>
    {qr&&<a href={qr} target="_blank" rel="noreferrer" aria-label={t("Открыть QR в полном размере")}><img className="bank-payment-qr" src={qr} alt={t(`QR для оплаты — ${title}`)}/></a>}
    {["PROMPTPAY","BANK_RU"].includes(payment.method)&&!qr&&<p className="form-error"><Translated>{"Реквизиты ещё не настроены. Напишите менеджеру."}</Translated></p>}
    <p className="payment-amount"><Translated>{money(payment.total)}</Translated> ฿</p>
    {payment.method==="BANK_RU"&&(rate?<p className="payment-conversion"><Translated>{money(payment.total)}</Translated> ฿ × <Translated>{money(rate)}</Translated> ₽/฿ = <strong><Translated>{money(Math.round(payment.total*rate*100)/100)}</Translated> ₽</strong></p>:<p className="form-error"><Translated>{"Курс ещё не настроен. Уточните сумму у менеджера."}</Translated></p>)}
    <p><Translated>{payment.method==="CASH"?"Согласуйте с менеджером передачу наличных. Подписка станет активной после подтверждения оплаты.":"После оплаты пришлите чек в чат с менеджером из личного кабинета."}</Translated></p>
    <button type="button" onClick={onChat}><Translated>{"Открыть чат с менеджером"}</Translated></button><small><Translated>{"Подписку активирует менеджер после проверки оплаты."}</Translated></small>
    </>}
  </section></div>;
}
