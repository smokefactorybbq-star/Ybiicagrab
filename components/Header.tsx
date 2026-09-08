import Link from "next/link";

export default function Header() {
  return (
    <header className="site-header">
      <Link className="brand" href="/shop.html" aria-label="Smoke Factory BBQ — меню">
        <span className="brand-mark">SF</span>
        <span><strong>Smoke Factory BBQ</strong><small>Phuket</small></span>
      </Link>
      <nav className="desktop-nav" aria-label="Основная навигация">
        <Link href="/shop.html">Меню</Link>
        <a href="https://meal-point.com">30 дней неодинаковой еды</a>
        <Link href="/contacts">Контакты</Link>
      </nav>
      <Link className="account-button" href="/account">Личный кабинет</Link>
    </header>
  );
}
