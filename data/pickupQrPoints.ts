import { pickupPoints } from "./pickupPoints";

export type PickupQrPoint = { code: string; name: string; address: string };

export const pickupQrPoints: PickupQrPoint[] = pickupPoints.map(({ code, name, address }) => ({ code, name, address }));

export function findPickupQrPointByCode(code: string | null | undefined) {
  return pickupQrPoints.find((point) => point.code === code) || null;
}
