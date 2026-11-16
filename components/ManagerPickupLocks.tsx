"use client";

import {Translated,useLanguage} from "./LanguageProvider";
import {getLocale} from "../lib/i18n/translate";
import { useCatalog } from "./useCatalog";
import ManagerPickupLock from "./ManagerPickupLock";

/**
 * One existing manager lock card for every active pickup point from the database.
 * Shows even unconfigured/offline controllers, so a new device can be connected later.
 */
export default function ManagerPickupLocks() {
  const {t,language}=useLanguage();

  const { points, ready, error } = useCatalog();

  return <>
    {error && <section className="manager-feature-card"><p className="form-error"><Translated>{"Не удалось загрузить холодильники: "}</Translated><Translated>{error}</Translated></p></section>}
    {!ready && !error && <section className="manager-feature-card"><p><Translated>{"Загружаем пункты выдачи…"}</Translated></p></section>}
    {ready && points.length === 0 && <section className="manager-feature-card"><p><Translated>{"Активных пунктов выдачи пока нет."}</Translated></p></section>}
    {points.map(point => (
      <ManagerPickupLock key={point.code} point={point.code} pointName={point.name} />
    ))}
  </>;
}
