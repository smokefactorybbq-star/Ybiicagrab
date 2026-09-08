export type PickupQrPoint = {
  code: string;
  name: string;
  address: string;
};

export const pickupQrPoints: PickupQrPoint[] = [
  { code: "chalong", name: "Chalong Meal Point", address: "Chalong, Mueang Phuket, Phuket" },
  { code: "rawai", name: "Rawai Meal Point", address: "Rawai, Mueang Phuket, Phuket" },
  { code: "phuket-town", name: "Phuket Town Meal Point", address: "Phuket Town, Mueang Phuket, Phuket" },
  { code: "patong", name: "Patong Meal Point", address: "Patong, Kathu, Phuket" },
  { code: "bang-tao", name: "Bang Tao Meal Point", address: "Bang Tao, Thalang, Phuket" }
];

export function findPickupQrPointByCode(code: string | null | undefined) {
  return pickupQrPoints.find((point) => point.code === code) || null;
}
