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
  if (typeof window.google?.maps?.importLibrary === "function") return Promise.resolve();
  if (window.__mealPointMapsPromise) return window.__mealPointMapsPromise;

  window.__mealPointMapsPromise = new Promise<void>((resolve, reject) => {
    const callbackName = "__mealPointGoogleMapsReady";
    const existing = document.getElementById("mealpoint-google-maps");

    // Удаляем незавершённый/старый загрузчик, например после hot reload.
    if (existing) existing.remove();

    (window as any)[callbackName] = () => {
      if (typeof window.google?.maps?.importLibrary === "function") {
        resolve();
      } else {
        reject(new Error("Google Maps загрузилась не полностью"));
      }
    };

    const script = document.createElement("script");
    script.id = "mealpoint-google-maps";
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&v=weekly&loading=async&callback=${callbackName}`;
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
      .then(async () => {
        if (cancelled || !mapNode.current || !window.google?.maps) return;

        const [mapsLibrary, markerLibrary] = await Promise.all([
          window.google.maps.importLibrary("maps"),
          window.google.maps.importLibrary("marker")
        ]);

        if (cancelled || !mapNode.current) return;

        const MapConstructor = mapsLibrary.Map;
        const AdvancedMarkerElement = markerLibrary.AdvancedMarkerElement;

        if (typeof MapConstructor !== "function") {
          throw new Error("Конструктор Google Maps не загрузился");
        }

        const map = new MapConstructor(mapNode.current, {
          center: { lat: 7.89, lng: 98.34 },
          zoom: 11,
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true
        });

        pickupPoints.forEach((point) => {
          const marker = new AdvancedMarkerElement({
            map,
            position: { lat: point.latitude, lng: point.longitude },
            title: point.name,
            gmpClickable: true
          });
          marker.addEventListener("gmp-click", () => {
            setSelected(point);
            map.panTo({ lat: point.latitude, lng: point.longitude });
            map.setZoom(14);
          });
        });

        if (location) {
          const dot = document.createElement("div");
          dot.setAttribute("aria-label", "Ваше местоположение");
          dot.style.width = "18px";
          dot.style.height = "18px";
          dot.style.borderRadius = "50%";
          dot.style.background = "#2367d1";
          dot.style.border = "3px solid #ffffff";
          dot.style.boxShadow = "0 1px 5px rgba(0,0,0,.35)";

          new AdvancedMarkerElement({
            map,
            position: { lat: location.latitude, lng: location.longitude },
            title: "Ваше местоположение",
            content: dot
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
