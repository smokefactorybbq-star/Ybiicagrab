"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

function AccountIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SubscriptionIcon() {
  return (
    <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 3.5v4M16.5 3.5v4M3.5 9.5h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13h3M8 16.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PickupIcon() {
  return (
    <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none">
      <path d="M20 10c0 5.2-8 11-8 11S4 15.2 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="10" r="2.7" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function RulesIcon() {
  return (
    <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

type MobileTab = "subscription" | "pickup" | "rules";

export default function Header() {
  const pathname = usePathname();
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>("subscription");

  useEffect(() => {
    const syncActiveTab = () => {
      if (pathname === "/rules") {
        setActiveMobileTab("rules");
        return;
      }

      if (pathname === "/") {
        setActiveMobileTab(window.location.hash === "#pickup-points" ? "pickup" : "subscription");
      }
    };

    syncActiveTab();
    window.addEventListener("hashchange", syncActiveTab);
    return () => window.removeEventListener("hashchange", syncActiveTab);
  }, [pathname]);

  const current = (tab: MobileTab) => (activeMobileTab === tab ? "page" : undefined);

  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/#top" aria-label="MealPoint — Еда по подписке">
          <img className="brand-logo" src="/mealpoint-logo.png" alt="MealPoint — Еда по подписке" />
        </Link>

        <nav className="desktop-nav" aria-label="Основная навигация">
          <Link href="/#subscription">Подписка</Link>
          <Link href="/#pickup-points">Точки выдачи</Link>
          <Link href="/rules">Правила</Link>
        </nav>

        <Link className="account-button" href="/account" aria-label="Личный кабинет">
          <AccountIcon />
          <span>Личный кабинет</span>
        </Link>
      </header>

      <nav className="mobile-bottom-nav" aria-label="Быстрая навигация">
        <Link
          href="/#subscription"
          className={activeMobileTab === "subscription" ? "active" : ""}
          aria-current={current("subscription")}
          onClick={() => setActiveMobileTab("subscription")}
        >
          <span className="mobile-bottom-nav-icon"><SubscriptionIcon /></span>
          <span>Подписка</span>
        </Link>

        <Link
          href="/#pickup-points"
          className={activeMobileTab === "pickup" ? "active" : ""}
          aria-current={current("pickup")}
          onClick={() => setActiveMobileTab("pickup")}
        >
          <span className="mobile-bottom-nav-icon"><PickupIcon /></span>
          <span>Точки выдачи</span>
        </Link>

        <Link
          href="/rules"
          className={activeMobileTab === "rules" ? "active" : ""}
          aria-current={current("rules")}
          onClick={() => setActiveMobileTab("rules")}
        >
          <span className="mobile-bottom-nav-icon"><RulesIcon /></span>
          <span>Правила</span>
        </Link>
      </nav>
    </>
  );
}
