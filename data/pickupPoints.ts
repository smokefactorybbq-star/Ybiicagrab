export type PickupPoint = {
  name: string;
  shortName: string;
  address: string;
  latitude: number;
  longitude: number;
  hours: string;
};

export const pickupPoints: PickupPoint[] = [
  {
    name: "Chalong Meal Point",
    shortName: "Chalong",
    address: "Chalong, Mueang Phuket, Phuket",
    latitude: 7.8471,
    longitude: 98.3385,
    hours: "Ежедневно 11:00–21:00"
  },
  {
    name: "Rawai Meal Point",
    shortName: "Rawai",
    address: "Rawai, Mueang Phuket, Phuket",
    latitude: 7.7793,
    longitude: 98.3258,
    hours: "Ежедневно 11:00–21:00"
  },
  {
    name: "Phuket Town Meal Point",
    shortName: "Phuket Town",
    address: "Phuket Town, Mueang Phuket, Phuket",
    latitude: 7.8804,
    longitude: 98.3923,
    hours: "Ежедневно 11:00–21:00"
  },
  {
    name: "Patong Meal Point",
    shortName: "Patong",
    address: "Patong, Kathu, Phuket",
    latitude: 7.8966,
    longitude: 98.2964,
    hours: "Ежедневно 11:00–21:00"
  },
  {
    name: "Bang Tao Meal Point",
    shortName: "Bang Tao",
    address: "Bang Tao, Thalang, Phuket",
    latitude: 7.9943,
    longitude: 98.3047,
    hours: "Ежедневно 11:00–21:00"
  }
];

export function findPickupPoint(name: string | null | undefined) {
  return pickupPoints.find((point) => point.name === name) || null;
}

export function buildGoogleMapsRouteUrl(point: PickupPoint, origin?: { latitude: number; longitude: number } | null) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${point.latitude},${point.longitude}`,
    travelmode: "driving"
  });
  if (origin) params.set("origin", `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
