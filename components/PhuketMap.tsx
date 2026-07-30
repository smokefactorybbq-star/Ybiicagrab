"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QuestionLink from "./QuestionLink";
import { buildGoogleMapsRouteUrl, pickupPoints, type PickupPoint } from "../data/pickupPoints";

declare global {
  interface Window {
    google?: any;
    __mealPointMapsPromise?: Promise<void>;
  }
}

type Location = { latitude: number; longitude: number };

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve();
  if (window.__mealPointMapsPromise) return window.__mealPointMapsPromise;

  window.__mealPointMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("mealpoint-google-maps") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps не загрузилась")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "mealpoint-google-maps";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps не загрузилась"));
    document.head.appendChild(script);
  });

  return window.__mealPointMapsPromise;
}

export default function PhuketMap() {
  const mapNode = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<PickupPoint>(pickupPoints[0]);
  const [location, setLocation] = useState<Location | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "loading" | "ready" | "denied">("idle");
  const [mapError, setMapError] = useState("");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const routeUrl = useMemo(() => buildGoogleMapsRouteUrl(selected, location), [selected, location]);

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationState("denied");
      return;
    }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationState("ready");
      },
      () => setLocationState("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => {
    if (!apiKey || !mapNode.current) return;
    let cancelled = false;

    void loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapNode.current || !window.google?.maps) return;
        const map = new window.google.maps.Map(mapNode.current, {
          center: { lat: 7.89, lng: 98.34 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true
        });

        pickupPoints.forEach((point) => {
          const marker = new window.google.maps.Marker({
            map,
            position: { lat: point.latitude, lng: point.longitude },
            title: point.name,
            label: "M"
          });
          marker.addListener("click", () => {
            setSelected(point);
            map.panTo({ lat: point.latitude, lng: point.longitude });
            map.setZoom(14);
          });
        });

        if (location) {
          new window.google.maps.Marker({
            map,
            position: { lat: location.latitude, lng: location.longitude },
            title: "Ваше местоположение",
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#2367d1",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3
            }
          });
        }
      })
      .catch((error) => setMapError(error instanceof Error ? error.message : "Google Maps не загрузилась"));

    return () => { cancelled = true; };
  }, [apiKey, location]);

  return (
    <section className="map-section">
      <div className="section-heading split-heading">
        <div>
          <span className="eyebrow">Пункты выдачи</span>
          <h2>Найдите ближайший Meal Point</h2>
          <p>Разрешите геолокацию, выберите ПВ и откройте готовый маршрут в Google Maps на телефоне.</p>
        </div>
        <div className="section-actions"><span className="map-status"><i /> {pickupPoints.length} точек открыто</span><QuestionLink /></div>
      </div>

      <div className="google-map-layout">
        <div className="map-shell google-map-shell">
          {apiKey ? <div ref={mapNode} className="google-map-canvas" /> : (
            <div className="map-key-warning">
              <strong>Добавьте ключ Google Maps</strong>
              <span>В Railway нужна переменная NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</span>
            </div>
          )}
          {mapError && <div className="map-error-banner">{mapError}</div>}
        </div>

        <aside className="map-route-panel">
          <span className="eyebrow">Выбранный ПВ</span>
          <h3>{selected.name}</h3>
          <p>{selected.address}</p>
          <small>{selected.hours}</small>
          <button type="button" className="location-button" onClick={requestLocation}>
            {locationState === "loading" ? "Определяем…" : locationState === "ready" ? "Местоположение получено" : "Разрешить геолокацию"}
          </button>
          {locationState === "denied" && <small className="location-warning">Доступ не предоставлен. Google Maps всё равно сможет использовать геолокацию телефона после открытия маршрута.</small>}
          <a className="primary-link map-route-link" href={routeUrl}>Построить маршрут</a>
        </aside>
      </div>

      <div className="point-list google-point-list">
        {pickupPoints.map((point, index) => (
          <button type="button" className={selected.name === point.name ? "selected" : ""} key={point.name} onClick={() => setSelected(point)}>
            <b>{index + 1}</b><span>{point.name}</span><small>{point.hours}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
