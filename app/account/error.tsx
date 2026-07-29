"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AccountError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("MealPoint account page error", error);
  }, [error]);

  return (
    <main className="page-shell account-page">
      <section className="empty-account">
        <span className="eyebrow">Личный кабинет</span>
        <h1>Не удалось открыть кабинет</h1>
        <p>Данные подписки сохранены. Попробуйте открыть страницу ещё раз.</p>
        <button type="button" onClick={reset}>Повторить</button>
        <Link href="/">Вернуться на главную</Link>
      </section>
    </main>
  );
}
