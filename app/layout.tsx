import type { Metadata } from "next";
import "./globals.css";
import Header from "../components/Header";

export const metadata: Metadata = {
  title: "Smoke Factory BBQ Phuket",
  description: "Заказ блюд Smoke Factory BBQ на Пхукете. Доставка и самовывоз."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Header />
        {children}
        <footer className="site-footer">
          <div><strong>Smoke Factory BBQ</strong><span>Phuket, Thailand</span></div>
          <div><span>© {new Date().getFullYear()}</span></div>
        </footer>
      </body>
    </html>
  );
}
