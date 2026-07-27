"use client";

import { useMemo, useState } from "react";

const dishes = [
  { id: 1, name: "Борщ", description: "300 г · сметана отдельно", price: 130, image: "/meal-2.svg" },
  { id: 2, name: "Бефстроганов", description: "320 г · с картофельным пюре", price: 180, image: "/meal-5.svg" },
  { id: 3, name: "Рёбра BBQ", description: "320 г · фирменный соус", price: 300, image: "/meal-4.svg" },
  { id: 4, name: "Куриный шашлык", description: "200 г · овощи и соус", price: 140, image: "/meal-1.svg" },
  { id: 5, name: "Пельмени", description: "300 г · говядина", price: 130, image: "/meal-6.svg" },
  { id: 6, name: "Цезарь с копчёной курицей", description: "200 г", price: 140, image: "/meal-3.svg" }
];

export default function DeliveryPage() {
  const [cart, setCart] = useState<Record<number, number>>({});
  const [district, setDistrict] = useState("Chalong");
  const deliveryFee = district === "Chalong" ? 100 : district === "Rawai" ? 150 : district === "Patong" ? 100 : 50;
  const subtotal = useMemo(() => dishes.reduce((sum, dish) => sum + dish.price * (cart[dish.id] || 0), 0), [cart]);

  function changeQty(id: number, delta: number) {
    setCart((current) => ({ ...current, [id]: Math.max(0, (current[id] || 0) + delta) }));
  }

  return (
    <main className="page-shell delivery-page">
      <section className="page-intro">
        <span className="eyebrow">Доставка</span>
        <h1>Закажите любимые блюда домой</h1>
        <p>Структура повторяет ваше Telegram Mini App: меню, корзина, адрес, район, время и способ оплаты.</p>
      </section>

      <div className="delivery-layout">
        <section className="dish-grid">
          {dishes.map((dish) => (
            <article className="dish-card" key={dish.id}>
              <img src={dish.image} alt="" />
              <div><h2>{dish.name}</h2><p>{dish.description}</p><strong>{dish.price} ฿</strong></div>
              <div className="qty-control">
                <button type="button" onClick={() => changeQty(dish.id, -1)}>−</button>
                <span>{cart[dish.id] || 0}</span>
                <button type="button" onClick={() => changeQty(dish.id, 1)}>+</button>
              </div>
            </article>
          ))}
        </section>

        <aside className="checkout-card">
          <h2>Ваш заказ</h2>
          <label>Имя<input placeholder="Иван" /></label>
          <label>Телефон<input placeholder="+66" /></label>
          <label>Адрес<textarea placeholder="Название кондо, номер виллы или ссылка на карту" /></label>
          <label>Район
            <select value={district} onChange={(event) => setDistrict(event.target.value)}>
              <option>Phuket Town</option><option>Chalong</option><option>Rawai</option><option>Patong</option>
            </select>
          </label>
          <label>Когда доставить<select><option>Как можно скорее</option><option>Выбрать время</option></select></label>
          <label>Оплата<select><option>Thai bank / PromptPay</option><option>TrueMoney</option><option>Банк РФ</option></select></label>
          <div className="totals"><span>Блюда <b>{subtotal} ฿</b></span><span>Доставка <b>{deliveryFee} ฿</b></span><strong>Итого <b>{subtotal ? subtotal + deliveryFee : 0} ฿</b></strong></div>
          <button type="button" disabled={!subtotal} onClick={() => alert("Заказ будет отправляться менеджеру после подключения API и базы.")}>Оформить доставку</button>
        </aside>
      </div>
    </main>
  );
}

