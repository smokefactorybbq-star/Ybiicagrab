export const DELIVERY_FEES = {
  CENTRAL_KATHU: 50,
  BASE_UP_TOWN: 0,
  KATA_KARON: 150,
  RAWAI: 150,
  BANG_TAO: 200,
  SURIN: 200,
  CHALONG: 100,
  PATONG: 100,
  KAMALA: 150
} as const;

export type DeliveryDistrict = keyof typeof DELIVERY_FEES;

export function deliveryFeeForDistrict(value: unknown) {
  const district = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!(district in DELIVERY_FEES)) return null;
  return { district: district as DeliveryDistrict, fee: DELIVERY_FEES[district as DeliveryDistrict] };
}
