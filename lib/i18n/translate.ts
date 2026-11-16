import { english } from "./en";
export type Language = "ru" | "en";
const escape = (s:string) => s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const phrases = Object.keys(english).sort((a,b)=>b.length-a.length);
const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${phrases.map(escape).join("|")})(?![\\p{L}\\p{N}])`,"gu");
export function translateText(text:string,language:Language):string {
  if(language==="ru" || !/[А-Яа-яЁё]/.test(text))return text;
  const normalized=text.replace(/\s+/g," ").trim();
  if(english[normalized])return text.slice(0,text.length-text.trimStart().length)+english[normalized]+text.slice(text.trimEnd().length);
  return text.replace(pattern,match=>english[match]??match);
}
export function getLocale() {return typeof document!=="undefined"&&document.documentElement.lang==="en"?"en-GB":"ru-RU";}
