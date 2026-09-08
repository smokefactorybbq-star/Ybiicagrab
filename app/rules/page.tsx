import QuestionLink from "../../components/QuestionLink";

export default function RulesPage() {
  return (
    <main className="page-shell prose-page">
      <div className="page-intro page-intro-with-action">
        <div><span className="eyebrow">Правила заказа</span><h1>Smoke Factory BBQ</h1></div>
        <QuestionLink />
      </div>
      <section><h2>1. Вход</h2><p>Для оформления заказа необходимо войти через Telegram. Сайт использует тот же Telegram-аккаунт, что и Mini App.</p></section>
      <section><h2>2. Доставка</h2><p>При доставке выберите район и поставьте точку на карте. Наличная оплата для доставки недоступна.</p></section>
      <section><h2>3. Самовывоз</h2><p>При самовывозе адрес и район доставки не требуются. Можно выбрать PromptPay или Cash.</p></section>
      <section><h2>4. Заказ ко времени</h2><p>Заказ ко времени можно поставить минимум за один час до выбранного времени.</p></section>
      <section><h2>5. PromptPay</h2><p>После нажатия «Оформить заказ» сайт показывает QR с суммой заказа. После оплаты нажмите «Я оплатил» и отправьте чек в Telegram-бот.</p></section>
      <section><h2>6. Расчёт времени</h2><p>Расчётное время складывается из приготовления и поездки. Фактическое время может изменяться из-за загрузки кухни и дорожной ситуации.</p></section>
    </main>
  );
}
