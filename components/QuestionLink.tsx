"use client";

import {Translated,useLanguage} from "./LanguageProvider";
import {getLocale} from "../lib/i18n/translate";
const managerTelegramUrl = process.env.NEXT_PUBLIC_MANAGER_TELEGRAM_URL || "https://t.me/SmokefactoryBBQ";

export default function QuestionLink({ className = "question-link" }: { className?: string }) {
  const {t,language}=useLanguage();

  return (
    <a className={className} href={managerTelegramUrl} target="_blank" rel="noreferrer"><Translated>{" Задать вопрос "}</Translated></a>
  );
}
