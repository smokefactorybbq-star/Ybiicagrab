"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

const READER_ID = "mealpoint-qr-reader";

type ScanResponse = {
  ok: boolean;
  result: string;
  message?: string;
  error?: string;
  customerName?: string;
  phone?: string | null;
  code?: string;
  serviceDate?: string;
  remainingPortions?: number;
  selectedDays?: number;
  pickupPointName?: string;
  redeemedAt?: string | null;
  subscriptionId?: string;
  testMode?: boolean;
};

type ScannerInstance = {
  start: (
    camera: string | { facingMode: string },
    config: { fps: number; qrbox: { width: number; height: number }; aspectRatio: number },
    onSuccess: (decodedText: string) => void,
    onError: () => void
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  scanFile: (file: File, showImage?: boolean) => Promise<string>;
};

function resultTone(result?: string) {
  if (result === "REDEEMED") return "success";
  if (["ALREADY_REDEEMED", "DAY_PAUSED", "NOT_SCHEDULED_TODAY", "NO_PORTIONS"].includes(result || "")) return "warning";
  return "error";
}

export default function ScannerPage() {
  const [scannerKey, setScannerKey] = useState("");
  const [deviceId, setDeviceId] = useState("MealPoint scanner 1");
  const [pickupPointName, setPickupPointName] = useState("MealPoint");
  const [manualPayload, setManualPayload] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [testDate, setTestDate] = useState("");
  const [cameraRunning, setCameraRunning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [statusText, setStatusText] = useState("Введите ключ устройства и запустите камеру.");
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [globalTestClock, setGlobalTestClock] = useState<{ isTestMode: boolean; date: string; hour: number; minute: number } | null>(null);
  const scannerRef = useRef<ScannerInstance | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    setScannerKey(localStorage.getItem("mealpoint_scanner_key") || "");
    setDeviceId(localStorage.getItem("mealpoint_scanner_device") || "MealPoint scanner 1");
    setPickupPointName(localStorage.getItem("mealpoint_scanner_point") || "MealPoint");
    setTestDate(localStorage.getItem("mealpoint_scanner_test_date") || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
    void fetch("/api/app-time", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (data?.ok) setGlobalTestClock(data.clock); }).catch(() => undefined);

    return () => {
      const scanner = scannerRef.current;
      if (scanner) {
        void scanner.stop().catch(() => undefined);
        scanner.clear();
      }
    };
  }, []);

  function saveSettings() {
    localStorage.setItem("mealpoint_scanner_key", scannerKey);
    localStorage.setItem("mealpoint_scanner_device", deviceId);
    localStorage.setItem("mealpoint_scanner_point", pickupPointName);
    localStorage.setItem("mealpoint_scanner_test_date", testDate);
  }

  async function stopCamera() {
    const scanner = scannerRef.current;
    if (!scanner) return;

    try {
      await scanner.stop();
    } catch {
      // The camera can already be stopped after a successful decode.
    }
    setCameraRunning(false);
  }

  async function redeem(payload: string) {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setResult(null);
    setStatusText("Проверяем подписку…");
    saveSettings();

    try {
      const response = await fetch("/api/scanner/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-scanner-key": scannerKey
        },
        body: JSON.stringify({ payload, deviceId, pickupPointName, testMode, serviceDate: testDate })
      });
      const data = await response.json() as ScanResponse;
      setResult(data);
      setStatusText(data.ok ? "Списание выполнено." : (data.error || "Списание отклонено."));
    } catch {
      setResult({ ok: false, result: "NETWORK_ERROR", error: "Нет связи с сервером" });
      setStatusText("Нет связи с сервером.");
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  async function startCamera(event?: FormEvent) {
    event?.preventDefault();
    setResult(null);

    if (!scannerKey.trim() || !deviceId.trim() || !pickupPointName.trim()) {
      setResult({ ok: false, result: "SETTINGS_REQUIRED", error: "Заполните ключ, устройство и пункт выдачи" });
      return;
    }

    saveSettings();
    setStatusText("Запрашиваем доступ к камере…");

    try {
      const module = await import("html5-qrcode");
      const scanner = (scannerRef.current || new module.Html5Qrcode(READER_ID)) as unknown as ScannerInstance;
      scannerRef.current = scanner;

      const cameras = await module.Html5Qrcode.getCameras();
      const rearCamera = [...cameras].reverse().find((camera) => /back|rear|environment/i.test(camera.label));
      const camera = rearCamera?.id || cameras.at(-1)?.id || { facingMode: "environment" };

      await scanner.start(
        camera,
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => {
          void stopCamera().finally(() => redeem(decodedText));
        },
        () => undefined
      );
      setCameraRunning(true);
      setStatusText("Наведите камеру на QR-код подписки.");
    } catch (error) {
      console.error(error);
      setCameraRunning(false);
      setResult({
        ok: false,
        result: "CAMERA_ERROR",
        error: "Не удалось открыть камеру. Разрешите доступ или загрузите изображение QR."
      });
      setStatusText("Камера недоступна.");
    }
  }

  async function scanFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      await stopCamera();
      const module = await import("html5-qrcode");
      const scanner = (scannerRef.current || new module.Html5Qrcode(READER_ID)) as unknown as ScannerInstance;
      scannerRef.current = scanner;
      const decodedText = await scanner.scanFile(file, true);
      await redeem(decodedText);
    } catch {
      setResult({ ok: false, result: "FILE_SCAN_ERROR", error: "QR-код на изображении не найден" });
    }
  }


  async function resetTestScan() {
    if (!result?.subscriptionId || !result.serviceDate) return;
    setProcessing(true);
    try {
      const response = await fetch("/api/scanner/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-scanner-key": scannerKey
        },
        body: JSON.stringify({
          subscriptionId: result.subscriptionId,
          serviceDate: result.serviceDate,
          deviceId,
          pickupPointName
        })
      });
      const data = await response.json() as ScanResponse;
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось отменить списание");
      setResult({ ...result, ok: false, result: "TEST_RESET", error: data.message || "Тестовое списание отменено", remainingPortions: data.remainingPortions });
      setStatusText("Тестовое списание отменено.");
    } catch (error) {
      setResult({ ok: false, result: "RESET_ERROR", error: error instanceof Error ? error.message : "Ошибка сброса" });
    } finally {
      setProcessing(false);
    }
  }

  function redeemManual(event: FormEvent) {
    event.preventDefault();
    if (!manualPayload.trim()) {
      setResult({ ok: false, result: "EMPTY_QR", error: "Вставьте содержимое QR-кода" });
      return;
    }
    void redeem(manualPayload.trim());
  }

  return (
    <main className="page-shell scanner-page">
      <section className="scanner-heading">
        <div>
          <span className="eyebrow">MealPoint Scanner</span>
          <h1>Выдача обеда</h1>
          <p>Один успешный скан списывает одну порцию только за сегодняшний день по времени Пхукета.</p>
        </div>
        <Link href="/manager">К подпискам</Link>
      </section>

      {globalTestClock?.isTestMode && <p className="test-mode-banner">Глобальный тестовый режим: QR будет списываться за {globalTestClock.date}, время {String(globalTestClock.hour).padStart(2,"0")}:{String(globalTestClock.minute).padStart(2,"0")}.</p>}

      <section className="scanner-settings">
        <label>
          Ключ сканера
          <input type="password" value={scannerKey} onChange={(event) => setScannerKey(event.target.value)} placeholder="SCANNER_API_KEY" />
        </label>
        <label>
          Название устройства
          <input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="Например: Rawai scanner 1" />
        </label>
        <label>
          Пункт выдачи
          <input value={pickupPointName} onChange={(event) => setPickupPointName(event.target.value)} placeholder="Например: MealPoint Rawai" />
        </label>
        <label className="scanner-test-toggle">
          <span><input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} /> Тестовая дата</span>
          <input type="date" value={testDate} onChange={(event) => setTestDate(event.target.value)} disabled={!testMode} />
        </label>
      </section>

      <section className="scanner-grid">
        <article className="scanner-camera-card">
          <div id={READER_ID} className="scanner-reader" />
          <p className="scanner-status">{statusText}</p>
          <div className="scanner-actions">
            {!cameraRunning ? (
              <button type="button" onClick={() => startCamera()} disabled={processing}>Открыть камеру</button>
            ) : (
              <button type="button" className="secondary" onClick={() => stopCamera()}>Остановить камеру</button>
            )}
            <label className="scanner-file-button">
              Загрузить фото QR
              <input type="file" accept="image/*" onChange={scanFile} />
            </label>
          </div>
        </article>

        <article className="scanner-result-card">
          {!result ? (
            <div className="scanner-placeholder">
              <strong>Результат появится здесь</strong>
              <span>Для теста откройте QR клиента на другом устройстве.</span>
            </div>
          ) : (
            <div className={`scanner-result scanner-result-${resultTone(result.result)}`}>
              <span className="scanner-result-icon">{result.ok ? "✓" : resultTone(result.result) === "warning" ? "!" : "×"}</span>
              <h2>{result.ok ? "Обед выдан" : result.error}</h2>
              {result.customerName && <strong>{result.customerName}</strong>}
              {result.code && <small>Подписка: {result.code}</small>}
              {typeof result.remainingPortions === "number" && (
                <p>Осталось обедов: <b>{result.remainingPortions}</b>{result.selectedDays ? ` из ${result.selectedDays}` : ""}</p>
              )}
              {result.serviceDate && <small>Дата списания: {result.serviceDate}</small>}
              {result.redeemedAt && <small>Первое списание: {new Date(result.redeemedAt).toLocaleString("ru-RU")}</small>}
              {result.ok && result.testMode && result.subscriptionId && (
                <button type="button" className="reset-test-button" onClick={resetTestScan} disabled={processing}>Отменить тестовое списание</button>
              )}
              <button type="button" onClick={() => startCamera()} disabled={processing}>Сканировать следующий</button>
            </div>
          )}
        </article>
      </section>

      <details className="scanner-debug">
        <summary>Ручная проверка QR</summary>
        <form onSubmit={redeemManual}>
          <textarea value={manualPayload} onChange={(event) => setManualPayload(event.target.value)} placeholder="mealpoint:v1:..." />
          <button type="submit" disabled={processing}>{processing ? "Проверяем…" : "Проверить и списать"}</button>
        </form>
      </details>
    </main>
  );
}
