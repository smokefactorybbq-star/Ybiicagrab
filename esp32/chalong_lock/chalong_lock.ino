#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// =========================
// MealPoint Chalong lock
// ESP32-2432S028 / relay on IO27
// Relay module: 3.3V Active LOW
// Relay contacts for magnetic lock: COM + NC
// =========================

const char* WIFI_SSID = "PUT_WIFI_NAME_HERE";
const char* WIFI_PASSWORD = "PUT_WIFI_PASSWORD_HERE";

const char* SERVER_URL = "https://meal-point.com/api/pickup-lock?point=chalong";
const char* DEVICE_KEY = "PUT_SAME_KEY_AS_RAILWAY_HERE";

const int RELAY_PIN = 27;
const int RELAY_ON = LOW;   // relay energized -> COM/NC opens -> magnet loses power -> unlocked
const int RELAY_OFF = HIGH; // relay released -> COM/NC closed -> magnet powered -> locked

const unsigned long POLL_INTERVAL_MS = 800;
const unsigned long NETWORK_FAIL_LOCK_MS = 3000;
const unsigned long MAX_LOCAL_UNLOCK_MS = 25000;

unsigned long lastPollAt = 0;
unsigned long lastGoodServerAt = 0;
unsigned long unlockStartedAt = 0;
bool unlocked = false;
bool forcedSafeLock = false;

void lockDoor() {
  digitalWrite(RELAY_PIN, RELAY_OFF);
  if (unlocked) Serial.println("LOCKED");
  unlocked = false;
}

void unlockDoor() {
  digitalWrite(RELAY_PIN, RELAY_ON);
  if (!unlocked) {
    unlockStartedAt = millis();
    Serial.println("UNLOCKED");
  }
  unlocked = true;
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  lockDoor();
  Serial.printf("Connecting WiFi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi failed. Door stays locked.");
  }
}

bool pollServer(bool &shouldOpen) {
  shouldOpen = false;
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  // Working deployment mode. HTTPS traffic is encrypted, but certificate identity
  // is not pinned. For a hardened production build, replace with setCACert().
  client.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(2500);
  http.setTimeout(2500);

  if (!http.begin(client, SERVER_URL)) return false;
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.addHeader("Cache-Control", "no-cache");

  const int code = http.GET();
  if (code != 200) {
    Serial.printf("Server HTTP %d\n", code);
    http.end();
    return false;
  }

  const String body = http.getString();
  http.end();

  if (body.indexOf("\"ok\":true") < 0) return false;
  shouldOpen = body.indexOf("\"open\":true") >= 0;
  return true;
}

void setup() {
  // Set the relay safe state before enabling output.
  digitalWrite(RELAY_PIN, RELAY_OFF);
  pinMode(RELAY_PIN, OUTPUT);

  Serial.begin(115200);
  delay(300);
  Serial.println("MealPoint Chalong lock starting");
  lockDoor();
  connectWiFi();
  lastGoodServerAt = millis();
}

void loop() {
  const unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    lockDoor();
    forcedSafeLock = false;
    connectWiFi();
    delay(100);
    return;
  }

  if (now - lastPollAt >= POLL_INTERVAL_MS) {
    lastPollAt = now;
    bool shouldOpen = false;
    const bool serverOk = pollServer(shouldOpen);

    if (serverOk) {
      lastGoodServerAt = now;

      if (!shouldOpen) {
        forcedSafeLock = false;
        lockDoor();
      } else if (!forcedSafeLock) {
        if (!unlocked) unlockDoor();
      }
    }
  }

  // Fail safe: loss of server communication always returns the magnet to LOCKED.
  if (now - lastGoodServerAt > NETWORK_FAIL_LOCK_MS) {
    lockDoor();
    forcedSafeLock = true;
  }

  // Independent local safety limit: never keep the relay energized indefinitely.
  if (unlocked && now - unlockStartedAt > MAX_LOCAL_UNLOCK_MS) {
    Serial.println("Local unlock safety timeout -> LOCKED");
    lockDoor();
    forcedSafeLock = true;
  }

  delay(10);
}
