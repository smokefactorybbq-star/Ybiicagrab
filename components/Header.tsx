import Link from "next/link";

function AccountIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Header() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="MealPoint — главная">
        <span className="brand-mark">M</span>
        <span>
          <strong>MealPoint</strong>
          <small>еда рядом, время — ваше</small>
        </span>
      </Link>

      <nav className="desktop-nav" aria-label="Основная навигация">
        <Link href="/#subscription">Съедобная подписка</Link>
        <Link href="/delivery">Заказать доставку</Link>
        <Link href="/rules">Правила и условия</Link>
        <Link href="/contacts">Контакты</Link>
      </nav>

      <Link className="account-button" href="/account" aria-label="Личный кабинет">
        <AccountIcon />
        <span>Личный кабинет</span>
      </Link>
    </header>
  );
}

