"use client";

import {Translated,useLanguage} from "./LanguageProvider";
import {getLocale} from "../lib/i18n/translate";
import {useState} from "react";
export default function ManagerAddDays({id,name,lastDate,onDone}:{id:string;name:string;lastDate:string;onDone:()=>void}){
  const {t,language}=useLanguage();

 const [open,setOpen]=useState(false),[days,setDays]=useState("1"),[key,setKey]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function save(){setBusy(true);setError("");try{const r=await fetch("/api/manager/subscriptions/add-days",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,days:Number(days),requestKey:key})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Не удалось добавить дни");setOpen(false);onDone();}catch(e){setError(e instanceof Error?e.message:"Ошибка добавления");}finally{setBusy(false);}}
 return <><button type="button" onClick={()=>{setOpen(true);setKey(crypto.randomUUID());setDays("1");setError("");}}><Translated>{"Добавить дни"}</Translated></button>{open&&<div className="modal-backdrop"><section className="payment-modal add-days-modal" role="dialog" aria-modal="true" aria-label={t("Добавить дни подписки")}><button className="modal-close" aria-label={t("Закрыть добавление дней")} disabled={busy} onClick={()=>setOpen(false)}>×</button><h2><Translated>{"Добавить дни"}</Translated></h2><p><Translated>{name}</Translated></p><p><Translated>{"Новые дни пойдут подряд после "}</Translated><Translated>{lastDate}</Translated><Translated>{". Сумма оплаты не изменится."}</Translated></p><label><Translated>{"Количество дней"}</Translated><input type="number" min="1" max="365" step="1" value={days} disabled={busy} onChange={e=>{setDays(e.target.value);setKey(crypto.randomUUID());}}/></label>{error&&<p role="alert" className="form-error"><Translated>{error}</Translated></p>}<button disabled={busy||!Number.isInteger(Number(days))||Number(days)<1||Number(days)>365} onClick={()=>void save()}><Translated>{busy?"Добавляем…":"Подтвердить"}</Translated></button></section></div>}</>;
}
