"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {translateText,type Language} from "../lib/i18n/translate";
const LanguageContext=createContext({language:"ru" as Language,setLanguage:(_language:Language)=>{},t:(text:string)=>text});
const KEY="mealpoint-language";
export function LanguageProvider({children}:{children:ReactNode}){
  const [language,update]=useState<Language>("ru");
  function setLanguage(next:Language){
    document.documentElement.lang=next;
    update(next);
    try{localStorage.setItem(KEY,next);}catch{}
  }
  useEffect(()=>{
    try{const saved=localStorage.getItem(KEY);if(saved==="en"||saved==="ru")setLanguage(saved);}catch{}
    const sync=(e:StorageEvent)=>{if(e.key===KEY&&(e.newValue==="en"||e.newValue==="ru")){document.documentElement.lang=e.newValue;update(e.newValue);}};
    window.addEventListener("storage",sync);return()=>window.removeEventListener("storage",sync);
  },[]);
  useEffect(()=>{
    document.documentElement.lang=language;
    document.title=language==="en"?"MealPoint — varied lunch subscriptions in Phuket":"MealPoint — подписка на разные обеды на Пхукете";
    const meta=document.querySelector('meta[name="description"]');
    meta?.setAttribute("content",language==="en"?"Choose your subscription days and collect a different, filling lunch at your nearest Meal Point.":"Выбирайте дни подписки и забирайте разные сытные обеды в ближайшем Meal Point.");
  },[language]);
  return <LanguageContext.Provider value={{language,setLanguage,t:(text)=>translateText(text,language)}}>{children}</LanguageContext.Provider>;
}
export function useLanguage(){return useContext(LanguageContext);}
// React renders these strings normally. No DOM mutation, remote translation,
// business-data changes or HTML injection is used.
export function Translated({children,error=false}:{children:ReactNode;error?:boolean}){
  const {t,language}=useLanguage();
  function translate(node:ReactNode):ReactNode{
    if(typeof node==="string"){
      const result=t(node);
      return error&&language==="en"&&/[А-Яа-яЁё]/.test(result)?"The request could not be completed. Please try again or contact the manager.":result;
    }
    if(Array.isArray(node))return node.map(translate);
    return node;
  }
  return <>{translate(children)}</>;
}
