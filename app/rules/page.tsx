import QuestionLink from "../../components/QuestionLink";
import { subscriptionRules } from "../../data/subscriptionRules";

export default function RulesPage() {
  return (
    <main className="page-shell prose-page">
      <div className="page-intro page-intro-with-action">
        <div><span className="eyebrow">Правила подписки</span><h1>Правила MealPoint</h1></div>
        <QuestionLink />
      </div>
      {subscriptionRules.map((rule, index) => (
        <section key={`${rule.title}-${index}`}>
          <h2>{index + 1}. {rule.title}</h2>
          <p>{rule.text}</p>
        </section>
      ))}
    </main>
  );
}
