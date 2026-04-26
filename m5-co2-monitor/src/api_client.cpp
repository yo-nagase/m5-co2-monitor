#include "api_client.h"
#include "../include/secrets.h"

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

static const int BUFFER_CAPACITY = 900;
static const int MAX_BATCH = 32;
static const unsigned long SHORT_BACKOFF_MS = 2000;
static const unsigned long LONG_BACKOFF_MS  = 10000;
static const int FAILURE_THRESHOLD = 5;
static const char* FIRMWARE_TAG = "1.0.0";

struct Sample {
  int32_t  ppm;
  uint32_t sampleMs;
};

static Sample buffer[BUFFER_CAPACITY];
static int head = 0;        // next read
static int count = 0;       // occupied slots

static char deviceId[16] = {0};
static unsigned long nextAttemptMs = 0;
static int consecutiveFailures = 0;

static void enqueue(const Sample& s) {
  int tail = (head + count) % BUFFER_CAPACITY;
  if (count == BUFFER_CAPACITY) {
    head = (head + 1) % BUFFER_CAPACITY;
  } else {
    count++;
  }
  buffer[tail] = s;
}

void apiClientInit() {
  uint64_t mac = ESP.getEfuseMac();
  snprintf(deviceId, sizeof(deviceId), "core2-%06llx", (unsigned long long)(mac & 0xFFFFFFULL));
  Serial.printf("[api] device_id = %s\n", deviceId);
  head = 0;
  count = 0;
  nextAttemptMs = 0;
  consecutiveFailures = 0;
}

const char* apiClientDeviceId() {
  return deviceId;
}

int apiClientQueueSize() {
  return count;
}

void apiClientPushSample(int ppm, uint32_t sampleMs) {
  Sample s{(int32_t)ppm, sampleMs};
  enqueue(s);
}

// Send up to n samples in one POST. samples[0] is the newest.
static bool sendBatch(const Sample* samples, int n) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(8000);

  String url = String(API_BASE_URL) + "/api/ingest";
  if (!http.begin(client, url)) {
    Serial.println("[api] http.begin failed");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["fw"] = FIRMWARE_TAG;
  JsonArray arr = doc["samples"].to<JsonArray>();
  uint32_t now = millis();
  for (int i = 0; i < n; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["ppm"] = samples[i].ppm;
    o["ms_ago"] = (uint32_t)(now - samples[i].sampleMs);
  }

  // ~30 bytes per sample + envelope; 32 samples ≈ 1KB. 2KB is safe.
  static char body[2048];
  size_t len = serializeJson(doc, body, sizeof(body));

  int code = http.POST((uint8_t*)body, len);
  http.end();

  if (code >= 200 && code < 300) {
    Serial.printf("[api] POST ok n=%d q=%d\n", n, count - n);
    return true;
  }
  Serial.printf("[api] POST failed code=%d n=%d q=%d\n", code, n, count);
  return false;
}

void apiClientUpdate() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (count == 0) return;
  if (millis() < nextAttemptMs) return;

  // LIFO batch drain: take up to MAX_BATCH samples from the tail (newest first)
  // so the freshest measurement reaches the dashboard first; queued older
  // samples drain in reverse order over subsequent ticks. If the ring fills,
  // enqueue() still drops the oldest (head).
  int n = count < MAX_BATCH ? count : MAX_BATCH;
  Sample batch[MAX_BATCH];
  for (int i = 0; i < n; i++) {
    int idx = (head + count - 1 - i) % BUFFER_CAPACITY;
    batch[i] = buffer[idx];
  }

  if (sendBatch(batch, n)) {
    count -= n;  // pop n from the tail (LIFO)
    consecutiveFailures = 0;
    nextAttemptMs = 0;
  } else {
    consecutiveFailures++;
    unsigned long backoff = (consecutiveFailures >= FAILURE_THRESHOLD) ? LONG_BACKOFF_MS : SHORT_BACKOFF_MS;
    nextAttemptMs = millis() + backoff;
  }
}
