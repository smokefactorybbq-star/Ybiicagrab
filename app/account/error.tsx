"use client";

import {Translated,useLanguage} from "../../components/LanguageProvider";
import {getLocale} from "../../lib/i18n/translate";
import Link from "next/link";
import { useEffect } from "react";

export default function AccountError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const {t,language}=useLanguage();

  useEffect(() => {
    console.error("MealPoint account page error", error);
  }, [error]);

  return (
    <main className="page-shell account-page">
      <section className="empty-account">
        <span className="eyebrow"><Translated>{"Личный кабинет"}</Translated></span>
        <h1><Translated>{"Не удалось открыть кабинет"}</Translated></h1>
        <p><Translated>{"Данные подписки сохранены. Попробуйте открыть страницу ещё раз."}</Translated></p>
        <button type="button" onClick={reset}><Translated>{"Повторить"}</Translated></button>
        <Link href="/"><Translated>{"Вернуться на главную"}</Translated></Link>
      </section>
    </main>
  );
}
