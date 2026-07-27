import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "MealPoint — съедобная подписка и доставка на Пхукете",
  description: "Выбирайте дни, получайте разные обеды в ближайшем Meal Point и заказывайте доставку."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Header />
        {children}
        <footer className="site-footer">
          <div><strong>MealPoint</strong><span>Мы экономим ваше время и деньги.</span></div>
          <div><span>Пхукет, Таиланд</span><span>© {new Date().getFullYear()}</span></div>
        </footer>
      </body>
    </html>
  );
}
