"use client";

import { useState } from "react";
import { buildGoogleMapsRouteUrl, findPickupPoint } from "../data/pickupPoints";

type Props = {
  pickupPointName: string;
  className?: string;
  label?: string;
};

export default function PickupRouteButton({ pickupPointName, className = "route-button", label = "Построить маршрут" }: Props) {
  const [loading, setLoading] = useState(false);
  const point = findPickupPoint(pickupPointName);

  function openRoute() {
    if (!point) return;
    setLoading(true);

    const open = (origin?: { latitude: number; longitude: number } | null) => {
      window.location.href = buildGoogleMapsRouteUrl(point, origin);
      setLoading(false);
    };

    if (!navigator.geolocation) {
      open(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => open({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => open(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  }

  return (
    <button type="button" className={className} disabled={!point || loading} onClick={openRoute}>
      {loading ? "Определяем местоположение…" : label}
    </button>
  );
}
