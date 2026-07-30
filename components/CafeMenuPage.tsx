"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import QuestionLink from "./QuestionLink";
import type { Cafe } from "../data/cafes";

export default function CafeMenuPage({ cafe }: { cafe: Cafe }) {
  const [cart, setCart] = useState<Record<number, number>>({});
  const [district, setDistrict] = useState("Chalong");
  const deliveryFee = district === "Chalong" ? 100 : district === "Rawai" ? 150 : district === "Patong" ? 100 : 50;
  const subtotal = useMemo(
    () => cafe.dishes.reduce((sum, dish) => sum + dish.price * (cart[dish.id] || 0), 0),
    [cart, cafe.dishes]
  );

  function changeQty(id: number, delta: number) {
    setCart((current) => ({ ...current, [id]: Math.max(0, (current[id] || 0) + delta) }));
  }

  return (
    <main className="page-shell delivery-page cafe-menu-page">
      <section className="page-intro page-intro-with-action cafe-menu-intro">
        <div className={`cafe-logo-large ${cafe.logoClass}`}>{cafe.logoText}</div>
        <div>
          <span className="eyebrow">Меню кафе</span>
          <h1>{cafe.name}</h1>
          <p>{cafe.description}</p>
          <Link className="cafe-back-link" href="/delivery">← Все кафе</Link>
        </div>
        <QuestionLink />
      </section>

      <div className="delivery-layout">
        <section className="dish-grid">
          {cafe.dishes.map((dish) => (
            <article className="dish-card" key={dish.id}>
              <img src={dish.image} alt={dish.name} />
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
          <small className="checkout-cafe-name">Кафе: {cafe.name}</small>
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
          <button type="button" disabled={!subtotal} onClick={() => alert(`Заказ из ${cafe.name} будет отправляться менеджеру после подключения API партнёров.`)}>Оформить заказ</button>
        </aside>
      </div>
    </main>
  );
}
