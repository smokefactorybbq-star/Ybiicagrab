"use client";

import {Translated,useLanguage} from "./LanguageProvider";
import {getLocale} from "../lib/i18n/translate";
import {useState} from "react";
import QuestionLink from "./QuestionLink";
import PickupMapCanvas from "./PickupMapCanvas";
import {useCatalog} from "./useCatalog";
import {buildGoogleMapsRouteUrl,type PickupPoint} from "../data/pickupPoints";
const GOOGLE_EMBED="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d505924.0508525069!2d98.04095190342575!3d7.839289299200144!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x305031e2c462524f%3A0xe9ca9a85063dba21!2z0J_RhdGD0LrQtdGC!5e0!3m2!1sru!2sth!4v1789760301640!5m2!1sru!2sth";
export default function PhuketMap(){
  const {t,language}=useLanguage();

 const {points,ready,error}=useCatalog();const [selectedCode,setSelectedCode]=useState(""),[view,setView]=useState("points");
 const selected=points.find(p=>p.code===selectedCode)||points[0];
 function choose(point:PickupPoint){setSelectedCode(point.code);window.dispatchEvent(new CustomEvent("mealpoint-pickup-selected",{detail:point.code}));}
 return <section id="pickup-points" className="map-section"><div className="section-heading split-heading"><div><span className="eyebrow"><Translated>{"Пункты выдачи"}</Translated></span><h2><Translated>{"Найдите ближайший Meal Point"}</Translated></h2><p><Translated>{"Выберите красный указатель или карточку точки и постройте маршрут."}</Translated></p></div><div className="section-actions"><span className="map-status"><Translated>{points.length}</Translated><Translated>{" точек"}</Translated></span><QuestionLink/></div></div>{error&&<p className="form-error"><Translated>{error}</Translated></p>}<div className="map-view-tabs"><button type="button" aria-pressed={view==="points"} onClick={()=>setView("points")}><Translated>{"Точки выдачи"}</Translated></button><button type="button" aria-pressed={view==="google"} onClick={()=>setView("google")}><Translated>{"Google Maps · Пхукет"}</Translated></button></div><div className="google-map-layout"><div className="map-shell google-map-shell">{view==="points"?<PickupMapCanvas points={points} selectedCode={selected?.code} onSelect={choose}/>:<iframe title={t("Google Maps — Пхукет")} src={language==="en"?GOOGLE_EMBED.replaceAll("!1sru","!1sen"):GOOGLE_EMBED} width="600" height="450" style={{border:0,width:"100%",height:450}} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin"/>}</div><aside className="map-route-panel"><span className="eyebrow"><Translated>{"Выбранный ПВ"}</Translated></span>{selected?<><h3><Translated>{selected.name}</Translated></h3><p>{selected.address}</p><small><Translated>{selected.hours}</Translated></small><a href={selected.googleMapsUrl} target="_blank" rel="noreferrer"><Translated>{"Открыть точку в Google Maps"}</Translated></a><a className="primary-link map-route-link" href={buildGoogleMapsRouteUrl(selected)} target="_blank" rel="noreferrer"><Translated>{"Построить маршрут"}</Translated></a></>:<p><Translated>{ready?"Пункты выдачи пока не добавлены":"Загружаем точки…"}</Translated></p>}</aside></div><div className="point-list google-point-list">{points.map(point=><button type="button" key={point.code} className={selected?.code===point.code?"selected":""} onClick={()=>choose(point)}><b><Translated>{point.pointNumber}</Translated></b><span><Translated>{point.name}</Translated></span><small><Translated>{point.hours}</Translated></small></button>)}</div></section>;
}
