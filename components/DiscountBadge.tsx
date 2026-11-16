"use client";

import {Translated,useLanguage} from "./LanguageProvider";
import {getLocale} from "../lib/i18n/translate";
export default function DiscountBadge({percent}:{percent?:number}){
  const {t,language}=useLanguage();
return percent&&[20,30,50].includes(percent)?<img className="discount-badge" src={`/discounts/discount-${percent}${language==="en"?"-en":""}.svg`} alt={t(`${percent}% скидка`)}/>:null;}
