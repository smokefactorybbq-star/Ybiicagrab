import { NextResponse } from "next/server";
import { authorizeStaff } from "../../../../lib/staff-auth";
import { getMealTemplateForDate } from "../../../../data/meals";
import { query } from "../../../../lib/db";
import { getAppClock } from "../../../../lib/app-time";
import { addDaysToIso } from "../../../../lib/subscriptions";

import { processSubscriptionDayClosures } from "../../../../lib/subscription-maintenance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountRow = {
  service_date: string;
  total: number;
};

type DeliveryRow = {
  pickup_point_name: string;
  service_date: string;
  total: number;
};

type MealRow = {
  service_date: string;
  title: string;
  description: string;
  image_url: string | null;
};

export async function GET(request: Request) {
  const auth = await authorizeStaff(request, ["KITCHEN", "MANAGER"]);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  await processSubscriptionDayClosures();

  try {
    const clock = await getAppClock();
    const startDate = clock.date;
    const endDate = addDaysToIso(startDate, 6);
    const dates = Array.from({ length: 7 }, (_, index) => addDaysToIso(startDate, index));

    const [countResult, deliveryResult, mealResult] = await Promise.all([
      query<CountRow>(
        `SELECT sd.service_date::text AS service_date, COUNT(*)::int AS total
         FROM subscription_days sd
         JOIN subscriptions s ON s.id = sd.subscription_id
         WHERE s.status IN ('ACTIVE', 'COMPLETED')
           AND sd.service_date BETWEEN $1::date AND $2::date
           AND sd.status NOT IN ('PAUSED', 'PAUSE_REQUESTED')
         GROUP BY sd.service_date
         ORDER BY sd.service_date`,
        [startDate, endDate]
      ),
      query<DeliveryRow>(
        `SELECT
           COALESCE(NULLIF(BTRIM(s.pickup_point_name), ''), 'Пункт не указан') AS pickup_point_name,
           sd.service_date::text AS service_date,
           COUNT(*)::int AS total
         FROM subscription_days sd
         JOIN subscriptions s ON s.id = sd.subscription_id
         WHERE s.status IN ('ACTIVE', 'COMPLETED')
           AND sd.service_date BETWEEN $1::date AND $2::date
           AND sd.status NOT IN ('PAUSED', 'PAUSE_REQUESTED')
           AND s.fulfillment_type = 'PICKUP'
         GROUP BY pickup_point_name, sd.service_date
         ORDER BY pickup_point_name, sd.service_date`,
        [startDate, endDate]
      ),
      query<MealRow>(
        `SELECT service_date::text, title, description, image_url
         FROM meals
         WHERE service_date BETWEEN $1::date AND $2::date
           AND is_available = true
         ORDER BY service_date`,
        [startDate, endDate]
      )
    ]);

    const countByDate = new Map(countResult.rows.map((row) => [row.service_date, Number(row.total)]));
    const mealsByDate = new Map(mealResult.rows.map((row) => [row.service_date, row]));
    const pickupPointNames = [...new Set(deliveryResult.rows.map((row) => row.pickup_point_name))];
    const deliveryMap = new Map(
      deliveryResult.rows.map((row) => [`${row.pickup_point_name}:${row.service_date}`, Number(row.total)])
    );

    const days = dates.map((date) => {
      const customMeal = mealsByDate.get(date);
      const fallbackMeal = getMealTemplateForDate(date);
      return {
        date,
        meal: {
          title: customMeal?.title || fallbackMeal.title,
          description: customMeal?.description || fallbackMeal.description,
          image: customMeal?.image_url || fallbackMeal.image
        },
        totalMeals: countByDate.get(date) || 0
      };
    });

    const delivery = pickupPointNames.map((pickupPointName) => ({
      pickupPointName,
      counts: Object.fromEntries(
        dates.map((date) => [date, deliveryMap.get(`${pickupPointName}:${date}`) || 0])
      )
    }));

    return NextResponse.json({
      ok: true,
      generatedAt: clock.iso,
      testMode: clock.isTestMode,
      startDate,
      endDate,
      days,
      delivery
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    console.error("Kitchen weekly plan failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось сформировать план кухни" }, { status: 500 });
  }
}
