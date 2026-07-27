export default function ContactsPage() {
  return (
    <main className="page-shell contacts-page">
      <section className="page-intro"><span className="eyebrow">Контакты</span><h1>Мы рядом и отвечаем быстро</h1><p>Перед запуском замените демонстрационные данные на официальный телефон, LINE, WhatsApp и Telegram менеджера.</p></section>
      <div className="contact-grid">
        <article><span>Компания</span><strong>MealPoint by Smoke Factory BBQ</strong><p>Phuket, Thailand</p></article>
        <article><span>Телефон</span><strong>+66 XX XXX XXXX</strong><p>Ежедневно 10:00–22:00</p></article>
        <article><span>Мессенджеры</span><strong>Telegram · LINE · WhatsApp</strong><p>@mealpoint_phuket</p></article>
        <article><span>Партнёрам</span><strong>partners@mealpoint.example</strong><p>Подключение ресторанов и пунктов выдачи</p></article>
      </div>
    </main>
  );
}

