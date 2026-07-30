import Link from "next/link";
import QuestionLink from "../../components/QuestionLink";
import { cafes } from "../../data/cafes";

export default function CafeCatalogPage() {
  return (
    <main className="page-shell cafe-catalog-page">
      <section className="page-intro page-intro-with-action">
        <div>
          <span className="eyebrow">Меню кафе</span>
          <h1>Выберите кафе</h1>
          <p>Откройте меню выбранного ресторана, добавьте блюда в корзину и оформите доставку.</p>
        </div>
        <QuestionLink />
      </section>

      <section className="cafe-catalog-grid">
        {cafes.map((cafe) => (
          <Link className="cafe-catalog-card" href={`/delivery/${cafe.slug}`} key={cafe.slug}>
            <div className={`cafe-logo-tile ${cafe.logoClass}`}>{cafe.logoText}</div>
            <div>
              <h2>{cafe.name}</h2>
              <p>{cafe.tagline}</p>
              <span>Открыть меню →</span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
