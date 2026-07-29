import { NextResponse } from "next/server";
import { getMealTemplateForDate } from "../../../../data/meals";
import { query } from "../../../../lib/db";
import { addDaysToIso, getBangkokTodayIso } from "../../../../lib/subscriptions";

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

function authorize(request: Request) {
  const expectedUsername = process.env.KITCHEN_USERNAME || "kitchen";
  const expectedPassword = process.env.KITCHEN_PASSWORD || process.env.MANAGER_PASSWORD;
  const username = request.headers.get("x-kitchen-username") || "";
  const password = request.headers.get("x-kitchen-password") || "";

  if (!expectedPassword) {
    return { ok: false, error: "KITCHEN_PASSWORD или MANAGER_PASSWORD не задан", status: 503 };
  }
  if (username !== expectedUsername || password !== expectedPassword) {
    return { ok: false, error: "Неверный логин или пароль", status: 401 };
  }
  return { ok: true, error: "", status: 200 };
}

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const startDate = getBangkokTodayIso();
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
      generatedAt: new Date().toISOString(),
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
