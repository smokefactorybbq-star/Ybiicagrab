import { query } from "./db";
import type { PickupPoint } from "../data/pickupPoints";
export const pointSelect=`SELECT id::text,code,name,district,point_number AS "pointNumber",district AS "shortName",address,latitude::float8 AS latitude,longitude::float8 AS longitude,google_maps_url AS "googleMapsUrl",'Ежедневно 11:00–21:00' AS hours FROM pickup_points WHERE is_active=true AND code IS NOT NULL`;
export async function listPickupPoints(){return (await query<PickupPoint>(pointSelect+` ORDER BY created_at,code`)).rows;}
export async function findPickupPointByCode(code:string){return (await query<PickupPoint>(pointSelect+` AND code=$1`,[code])).rows[0]||null;}
export async function findPickupPointByName(name:string){return (await query<PickupPoint>(pointSelect+` AND name=$1`,[name])).rows[0]||null;}
export async function getDateDiscounts(){const r=await query<{date:string;percent:number}>(`SELECT service_date::text AS date,percent FROM meal_date_discounts ORDER BY service_date`);return Object.fromEntries(r.rows.map(r=>[r.date,r.percent]));}
