"use client";
import {useLanguage} from "./LanguageProvider";
export default function LanguageSwitch(){
  const {language,setLanguage}=useLanguage();
  const label=language==="ru"?"Переключить на английский":"Switch to Russian";
  return <button type="button" className="language-switch" aria-label={label} title={label} onClick={()=>setLanguage(language==="ru"?"en":"ru")}>
    {language==="ru"?<svg aria-hidden="true" width="28" height="20" viewBox="0 0 30 21"><path fill="#fff" d="M0 0h30v7H0z"/><path fill="#164ba0" d="M0 7h30v7H0z"/><path fill="#d52b1e" d="M0 14h30v7H0z"/></svg>:<svg aria-hidden="true" width="30" height="15" viewBox="-30 -15 60 30"><defs><clipPath id="language-union-jack-diagonal"><path d="M0 0h30v15z M0 0v15h-30z M0 0h-30v-15z M0 0v-15h30z"/></clipPath></defs><path fill="#012169" d="M-30-15h60v30h-60z"/><path stroke="#fff" strokeWidth="6" d="m-30-15 60 30m-60 0 60-30"/><path stroke="#c8102e" strokeWidth="4" clipPath="url(#language-union-jack-diagonal)" d="m-30-15 60 30m-60 0 60-30"/><path stroke="#fff" strokeWidth="10" d="M-30 0h60M0-15v30"/><path stroke="#c8102e" strokeWidth="6" d="M-30 0h60M0-15v30"/></svg>}
  </button>;
}
