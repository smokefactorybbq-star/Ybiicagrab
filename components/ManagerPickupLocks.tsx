"use client";

import { useCatalog } from "./useCatalog";
import ManagerPickupLock from "./ManagerPickupLock";

/**
 * One existing manager lock card for every active pickup point from the database.
 * Shows even unconfigured/offline controllers, so a new device can be connected later.
 */
export default function ManagerPickupLocks() {
  const { points, ready, error } = useCatalog();

  return <>
    {error && <section className="manager-feature-card"><p className="form-error">Не удалось загрузить холодильники: {error}</p></section>}
    {!ready && !error && <section className="manager-feature-card"><p>Загружаем пункты выдачи…</p></section>}
    {ready && points.length === 0 && <section className="manager-feature-card"><p>Активных пунктов выдачи пока нет.</p></section>}
    {points.map(point => (
      <ManagerPickupLock key={point.code} point={point.code} pointName={point.name} />
    ))}
  </>;
}
