#include "page_wifi.h"
#include <WiFi.h>

enum WifiPageState {
  WP_IDLE,
  WP_CONNECTING,
  WP_CONNECTED,
  WP_SC_WAIT,
  WP_FAILED,
};

static WifiPageState state = WP_IDLE;
static unsigned long stateStartMs = 0;
static const unsigned long CONNECT_TIMEOUT_MS = 15000;
static const unsigned long SC_TIMEOUT_MS = 120000;
static const unsigned long FAILED_SHOW_MS = 3000;

static const int BTN_X = 60;
static const int BTN_Y = 180;
static const int BTN_W = 200;
static const int BTN_H = 50;

static bool inButton(int x, int y) {
  return x >= BTN_X && x < BTN_X + BTN_W && y >= BTN_Y && y < BTN_Y + BTN_H;
}

static void startSmartConfig() {
  WiFi.disconnect();
  WiFi.mode(WIFI_STA);
  WiFi.beginSmartConfig();
  state = WP_SC_WAIT;
  stateStartMs = millis();
  Serial.println("[wifi] SmartConfig started");
}

static void cancelSmartConfig() {
  WiFi.stopSmartConfig();
  state = WP_IDLE;
  stateStartMs = millis();
  Serial.println("[wifi] SmartConfig canceled");
}

void pageWifiInit() {
  WiFi.persistent(true);
  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin();
  state = WP_CONNECTING;
  stateStartMs = millis();
  Serial.println("[wifi] auto-connect with stored credentials");
}

void pageWifiUpdate() {
  switch (state) {
    case WP_CONNECTING:
      if (WiFi.status() == WL_CONNECTED) {
        state = WP_CONNECTED;
        Serial.printf("[wifi] connected: %s / %s\n",
                      WiFi.SSID().c_str(),
                      WiFi.localIP().toString().c_str());
      } else if (millis() - stateStartMs > CONNECT_TIMEOUT_MS) {
        state = WP_IDLE;
        Serial.println("[wifi] connect timeout -> idle");
      }
      break;

    case WP_SC_WAIT:
      if (WiFi.smartConfigDone()) {
        WiFi.stopSmartConfig();
        state = WP_CONNECTING;
        stateStartMs = millis();
        Serial.println("[wifi] SmartConfig done, connecting...");
      } else if (millis() - stateStartMs > SC_TIMEOUT_MS) {
        WiFi.stopSmartConfig();
        state = WP_FAILED;
        stateStartMs = millis();
        Serial.println("[wifi] SmartConfig timeout");
      }
      break;

    case WP_CONNECTED:
      if (WiFi.status() != WL_CONNECTED) {
        state = WP_CONNECTING;
        stateStartMs = millis();
        Serial.println("[wifi] link lost, reconnecting...");
      }
      break;

    case WP_FAILED:
      if (millis() - stateStartMs > FAILED_SHOW_MS) {
        state = WP_IDLE;
      }
      break;

    case WP_IDLE:
    default:
      break;
  }

  if (currentPage != 2) return;

  auto t = M5.Touch.getDetail();
  if (!t.wasClicked()) return;
  if (!inButton(t.x, t.y)) return;

  switch (state) {
    case WP_IDLE:
    case WP_FAILED:
    case WP_CONNECTED:
      startSmartConfig();
      break;
    case WP_SC_WAIT:
      cancelSmartConfig();
      break;
    case WP_CONNECTING:
      break;
  }
}

static const char* statusLabel(uint16_t& color) {
  switch (state) {
    case WP_IDLE:       color = TFT_LIGHTGRAY; return "Disconnected";
    case WP_CONNECTING: color = TFT_YELLOW;    return "Connecting...";
    case WP_CONNECTED:  color = TFT_GREEN;     return "Connected";
    case WP_SC_WAIT:    color = TFT_YELLOW;    return "Waiting ESPtouch";
    case WP_FAILED:     color = TFT_RED;       return "Failed";
  }
  color = TFT_WHITE;
  return "";
}

static void drawButton() {
  const char* label;
  uint16_t bg;
  switch (state) {
    case WP_SC_WAIT:    bg = TFT_RED;        label = "Cancel";         break;
    case WP_CONNECTED:  bg = (uint16_t)0x03E0; label = "Re-configure"; break;
    case WP_CONNECTING: bg = TFT_DARKGREY;   label = "...";            break;
    default:            bg = TFT_BLUE;       label = "Start ESPtouch"; break;
  }
  canvas.fillRoundRect(BTN_X, BTN_Y, BTN_W, BTN_H, 8, bg);
  canvas.drawRoundRect(BTN_X, BTN_Y, BTN_W, BTN_H, 8, TFT_WHITE);
  canvas.setFont(&fonts::FreeSansBold12pt7b);
  canvas.setTextColor(TFT_WHITE);
  int tw = canvas.textWidth(label);
  int th = canvas.fontHeight();
  canvas.setCursor(BTN_X + (BTN_W - tw) / 2, BTN_Y + (BTN_H - th) / 2);
  canvas.print(label);
}

void pageWifiDraw() {
  canvas.setFont(&fonts::FreeSansBold12pt7b);
  canvas.setTextColor(TFT_WHITE);
  canvas.setCursor(10, 8);
  canvas.print("WiFi Setup");

  canvas.setFont(&fonts::FreeSans9pt7b);

  canvas.setTextColor(TFT_CYAN);
  canvas.setCursor(10, 45);
  canvas.print("Status:");
  uint16_t stColor;
  const char* stLabel = statusLabel(stColor);
  canvas.setTextColor(stColor);
  canvas.setCursor(90, 45);
  canvas.print(stLabel);

  if (state == WP_CONNECTED) {
    canvas.setTextColor(TFT_CYAN);
    canvas.setCursor(10, 75);
    canvas.print("SSID:");
    canvas.setTextColor(TFT_WHITE);
    canvas.setCursor(90, 75);
    canvas.print(WiFi.SSID());

    canvas.setTextColor(TFT_CYAN);
    canvas.setCursor(10, 100);
    canvas.print("IP:");
    canvas.setTextColor(TFT_WHITE);
    canvas.setCursor(90, 100);
    canvas.print(WiFi.localIP().toString());

    canvas.setTextColor(TFT_CYAN);
    canvas.setCursor(10, 125);
    canvas.print("RSSI:");
    canvas.setTextColor(TFT_WHITE);
    canvas.setCursor(90, 125);
    canvas.printf("%d dBm", WiFi.RSSI());
  } else if (state == WP_SC_WAIT) {
    canvas.setTextColor(TFT_LIGHTGRAY);
    canvas.setCursor(10, 75);
    canvas.print("1. Open EspTouch app");
    canvas.setCursor(10, 100);
    canvas.print("2. Enter WiFi password");
    canvas.setCursor(10, 125);
    canvas.print("3. Tap Confirm");
    canvas.setTextColor(TFT_YELLOW);
    canvas.setCursor(10, 155);
    unsigned long sec = (millis() - stateStartMs) / 1000;
    unsigned long remain = (SC_TIMEOUT_MS / 1000) > sec ? (SC_TIMEOUT_MS / 1000) - sec : 0;
    canvas.printf("Timeout in %lus", remain);
  } else if (state == WP_CONNECTING) {
    canvas.setTextColor(TFT_LIGHTGRAY);
    canvas.setCursor(10, 75);
    canvas.print("Trying stored credentials...");
  } else if (state == WP_IDLE) {
    canvas.setTextColor(TFT_LIGHTGRAY);
    canvas.setCursor(10, 75);
    canvas.print("Tap button to configure");
    canvas.setCursor(10, 100);
    canvas.print("WiFi via EspTouch app.");
  } else if (state == WP_FAILED) {
    canvas.setTextColor(TFT_RED);
    canvas.setCursor(10, 75);
    canvas.print("SmartConfig timed out.");
  }

  drawButton();

  canvas.setFont(&fonts::Font0);
}
