#include "api_client.h"
#include "../include/secrets.h"

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

static const int BUFFER_CAPACITY = 900;
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

static bool peek(Sample& out) {
  if (count == 0) return false;
  out = buffer[head];
  return true;
}

static void popFront() {
  if (count == 0) return;
  head = (head + 1) % BUFFER_CAPACITY;
  count--;
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

static bool sendOne(const Sample& s) {
  WiFiClient client;
  HTTPClient http;
  http.setConnectTimeout(200);
  http.setTimeout(300);

  String url = String(API_BASE_URL) + "/api/ingest";
  if (!http.begin(client, url)) {
    Serial.println("[api] http.begin failed");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["ppm"] = s.ppm;
  uint32_t msAgo = millis() - s.sampleMs;
  doc["ms_ago"] = msAgo;
  doc["fw"] = FIRMWARE_TAG;

  char body[192];
  size_t n = serializeJson(doc, body, sizeof(body));

  int code = http.POST((uint8_t*)body, n);
  http.end();

  if (code >= 200 && code < 300) {
    Serial.printf("[api] POST ok ppm=%d q=%d\n", s.ppm, count);
    return true;
  }
  Serial.printf("[api] POST failed code=%d ppm=%d q=%d\n", code, s.ppm, count);
  return false;
}

void apiClientUpdate() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (count == 0) return;
  if (millis() < nextAttemptMs) return;

  Sample s;
  if (!peek(s)) return;

  if (sendOne(s)) {
    popFront();
    consecutiveFailures = 0;
    nextAttemptMs = 0;
  } else {
    consecutiveFailures++;
    unsigned long backoff = (consecutiveFailures >= FAILURE_THRESHOLD) ? LONG_BACKOFF_MS : SHORT_BACKOFF_MS;
    nextAttemptMs = millis() + backoff;
  }
}
