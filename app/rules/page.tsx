"use client";

import {Translated,useLanguage} from "../../components/LanguageProvider";
import {getLocale} from "../../lib/i18n/translate";
import QuestionLink from "../../components/QuestionLink";
import { subscriptionRules } from "../../data/subscriptionRules";

export default function RulesPage() {
  const {t,language}=useLanguage();

  return (
    <main className="page-shell prose-page">
      <div className="page-intro page-intro-with-action">
        <div><span className="eyebrow"><Translated>{"Правила подписки"}</Translated></span><h1><Translated>{"Правила MealPoint"}</Translated></h1></div>
        <QuestionLink />
      </div>
      {subscriptionRules.map((rule, index) => (
        <section key={`${rule.title}-${index}`}>
          <h2><Translated>{index + 1}</Translated>. <Translated>{rule.title}</Translated></h2>
          <p><Translated>{rule.text}</Translated></p>
        </section>
      ))}
    </main>
  );
}
