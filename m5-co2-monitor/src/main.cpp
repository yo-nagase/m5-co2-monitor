#include "globals.h"
#include "page_co2.h"
#include "page_imu.h"
#include "page_wifi.h"
#include "api_client.h"

#include <WiFi.h>

CRGB leds[LED_COUNT];
M5Canvas canvas(&M5.Display);
int screenW;
int screenH;
MHZ19 mhz19;
int co2Value = 0;
unsigned long lastCO2Read = 0;
const unsigned long CO2_INTERVAL = 1000;
int currentPage = 0;

const int GRAPH_MAX_POINTS = 60;
int co2History[GRAPH_MAX_POINTS];
int historyCount = 0;

static const char* apiStatusName(ApiStatus s) {
  switch (s) {
    case API_STATUS_OK:      return "ok";
    case API_STATUS_FAIL:    return "fail";
    case API_STATUS_OFFLINE: return "offline";
    default:                 return "idle";
  }
}

static void heartbeatLog() {
  static unsigned long nextHbMs = 0;
  unsigned long now = millis();
  if (now < nextHbMs) return;
  nextHbMs = now + 10000;

  bool connected = WiFi.status() == WL_CONNECTED;
  Serial.printf("[hb] wifi=%s rssi=%d co2=%d q=%d status=%s\n",
                connected ? "up" : "down",
                connected ? WiFi.RSSI() : 0,
                co2Value,
                apiClientQueueSize(),
                apiStatusName(apiClientStatus()));
}

static void drawApiStatusIcon() {
  ApiStatus s = apiClientStatus();
  if (s == API_STATUS_IDLE) return;

  uint16_t color;
  switch (s) {
    case API_STATUS_OK:      color = TFT_GREEN;    break;
    case API_STATUS_FAIL:    color = TFT_RED;      break;
    case API_STATUS_OFFLINE: color = TFT_DARKGREY; break;
    default:                 return;
  }
  const int x0 = screenW - 14;
  const int yBase = 14;
  canvas.fillRect(x0,     yBase - 4,  3, 4,  color);
  canvas.fillRect(x0 + 4, yBase - 7,  3, 7,  color);
  canvas.fillRect(x0 + 8, yBase - 10, 3, 10, color);
}

void setup() {
  auto cfg = M5.config();
  cfg.internal_imu = true;
  M5.begin(cfg);
  Serial.printf("IMU isEnabled: %d\n", M5.Imu.isEnabled());
  screenW = M5.Display.width();
  screenH = M5.Display.height();
  canvas.createSprite(screenW, screenH);

  memset(co2History, 0, sizeof(co2History));

  FastLED.addLeds<SK6812, LED_PIN, GRB>(leds, LED_COUNT);
  FastLED.setBrightness(15);
  FastLED.clear();
  FastLED.show();

  Serial2.begin(9600, SERIAL_8N1, 13, 14);
  mhz19.begin(Serial2);
  mhz19.autoCalibration(false);

  pageWifiInit();
  apiClientInit();
}

void loop() {
  M5.update();

  // 各ボタンで直接ページ切り替え
  if (M5.BtnA.wasPressed()) { currentPage = 0; Serial.println("BtnA -> page 0"); }
  if (M5.BtnB.wasPressed()) { currentPage = 1; Serial.println("BtnB -> page 1"); }
  if (M5.BtnC.wasPressed()) { currentPage = 2; Serial.println("BtnC -> page 2"); }

  // CO2・LED・WiFi・API更新は常時
  pageCO2Update();
  pageWifiUpdate();
  apiClientUpdate();
  heartbeatLog();

  canvas.fillScreen(TFT_BLACK);
  switch (currentPage) {
    case 0: pageCO2Draw();  break;
    case 1: pageImuDraw();  break;
    case 2: pageWifiDraw(); break;
  }
  drawApiStatusIcon();
  canvas.pushSprite(0, 0);

  delay(30);
}