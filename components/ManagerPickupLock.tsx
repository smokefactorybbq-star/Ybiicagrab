"use client";

import { useCallback, useEffect, useState } from "react";

type LockStatus = {
  ok:boolean;
  point?:{code:string;name:string};
  configured?:boolean;
  online?:boolean;
  open?:boolean;
  openUntil?:string|null;
  lastSeenAt?:string|null;
  temperature?:number|null;
  humidity?:number|null;
  lastTelemetryAt?:string|null;
  rssi?:number|null;
  firmware?:string|null;
  lastEvent?:string|null;
  lastEventAt?:string|null;
  lastBootReason?:string|null;
  openSeconds?:number;
  error?:string;
};

function formatBangkok(value?:string|null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU",{
    timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
  }).format(date);
}

export default function ManagerPickupLock({point="patong"}:{point?:string}) {
  const [status,setStatus]=useState<LockStatus|null>(null);
  const [loading,setLoading]=useState(true);
  const [opening,setOpening]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>{
    try{
      const response=await fetch(`/api/manager/pickup-lock?point=${encodeURIComponent(point)}`,{
        credentials:"same-origin",cache:"no-store"
      });
      const data=await response.json() as LockStatus;
      if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось получить статус");
      setStatus(data);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Ошибка статуса замка");}
    finally{setLoading(false);}
  },[point]);

  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>void load(),10000);
    return()=>window.clearInterval(timer);
  },[load]);

  async function openDoor(){
    if(opening)return;
    setOpening(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/manager/pickup-lock",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({point,action:"open"})
      });
      const data=await response.json() as {ok?:boolean;error?:string;message?:string};
      if(!response.ok||!data.ok)throw new Error(data.error||"Не удалось открыть дверь");
      setMessage(data.message||"Команда открытия отправлена.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось открыть дверь");}
    finally{setOpening(false);}
  }

  return <section className="manager-feature-card pickup-lock-card">
    <div className="pickup-today-heading">
      <div>
        <span className="eyebrow">Холодильник · Chalong</span>
        <h2>Замок и ESP32</h2>
        <p>Статус обновляется каждые 10 секунд. Команда открытия действует {status?.openSeconds||20} секунд.</p>
      </div>
      <span className={`pickup-lock-status ${status?.online?"is-online":"is-offline"}`}>
        {loading?"Проверяем…":status?.online?"● ONLINE":"● OFFLINE"}
      </span>
    </div>

    <div className="pickup-lock-grid">
      <div><small>Связь</small><strong>{status?.configured?(status?.online?"ESP32 на связи":"Нет связи с ESP32"):"Замок не настроен"}</strong></div>
      <div><small>Последний сигнал</small><strong>{formatBangkok(status?.lastSeenAt)}</strong></div>
      <div><small>Температура</small><strong>{status?.temperature==null?"Датчик не установлен":`${status.temperature.toFixed(1)} °C`}</strong></div>
      <div><small>Влажность</small><strong>{status?.humidity==null?"—":`${status.humidity.toFixed(1)} %`}</strong></div>
      <div><small>Замок</small><strong>{status?.open?"ОТКРЫТ":"ЗАКРЫТ"}</strong></div>
      <div><small>Wi‑Fi RSSI</small><strong>{status?.rssi==null?"—":`${status.rssi} dBm`}</strong></div>
    </div>

    <div className="pickup-lock-actions">
      <button type="button" className="manager-primary"
        disabled={opening||!status?.configured||!status?.online}
        onClick={()=>void openDoor()}>
        {opening?"Отправляем…":`Открыть дверь на ${status?.openSeconds||20} сек.`}
      </button>
      <button type="button" disabled={loading} onClick={()=>void load()}>Обновить статус</button>
    </div>

    {message&&<p className="pickup-lock-success">{message}</p>}
    {error&&<p className="form-error">{error}</p>}
    {status?.lastEvent&&<p className="pickup-lock-meta">Последнее событие: <strong>{status.lastEvent}</strong> · {formatBangkok(status.lastEventAt)}{status.lastBootReason?` · причина: ${status.lastBootReason}`:""}</p>}
  </section>;
}
