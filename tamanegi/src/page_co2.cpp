#include "page_co2.h"
#include "api_client.h"

static const int GRAPH_X = 40;
static const int GRAPH_Y = 60;
static const int GRAPH_W = 260;
static const int GRAPH_H = 140;
static const int CO2_MIN = 400;
static const int CO2_MAX = 1500;

static void drawGraph() {
  // 軸
  canvas.drawLine(GRAPH_X, GRAPH_Y, GRAPH_X, GRAPH_Y + GRAPH_H, TFT_WHITE);
  canvas.drawLine(GRAPH_X, GRAPH_Y + GRAPH_H, GRAPH_X + GRAPH_W, GRAPH_Y + GRAPH_H, TFT_WHITE);

  // Y軸目盛り
  canvas.setFont(&fonts::Font2);
  canvas.setTextSize(1);
  canvas.setTextColor(TFT_LIGHTGRAY);
  int levels[] = {400, 600, 800, 1000, 1200, 1500};
  for (int lv : levels) {
    int yPos = GRAPH_Y + GRAPH_H - (int)((float)(lv - CO2_MIN) / (CO2_MAX - CO2_MIN) * GRAPH_H);
    canvas.drawFastHLine(GRAPH_X - 3, yPos, GRAPH_W + 3,
      (lv == 1000 || lv == 1500) ? (uint16_t)0x528A : (uint16_t)TFT_DARKGREY);
    canvas.setCursor(0, yPos - 4);
    canvas.printf("%d", lv);
  }

  if (historyCount < 2) return;

  float stepX = (float)GRAPH_W / (GRAPH_MAX_POINTS - 1);
  int start = (historyCount > GRAPH_MAX_POINTS) ? historyCount - GRAPH_MAX_POINTS : 0;
  int count = (historyCount > GRAPH_MAX_POINTS) ? GRAPH_MAX_POINTS : historyCount;

  for (int i = 1; i < count; i++) {
    int idx0 = (start + i - 1) % GRAPH_MAX_POINTS;
    int idx1 = (start + i)     % GRAPH_MAX_POINTS;
    int v0 = co2History[idx0];
    int v1 = co2History[idx1];

    int x0 = GRAPH_X + (int)((i - 1) * stepX);
    int x1 = GRAPH_X + (int)(i       * stepX);
    int y0 = GRAPH_Y + GRAPH_H - constrain((int)((float)(v0 - CO2_MIN) / (CO2_MAX - CO2_MIN) * GRAPH_H), 0, GRAPH_H);
    int y1 = GRAPH_Y + GRAPH_H - constrain((int)((float)(v1 - CO2_MIN) / (CO2_MAX - CO2_MIN) * GRAPH_H), 0, GRAPH_H);

    uint16_t lineColor = TFT_GREEN;
    if (v1 > 1500) lineColor = TFT_RED;
    else if (v1 > 1000) lineColor = TFT_YELLOW;

    canvas.drawLine(x0, y0, x1, y1, lineColor);
    if (i == count - 1) {
      canvas.fillCircle(x1, y1, 3, lineColor);
    }
  }
}

void pageCO2Update() {
  if (millis() - lastCO2Read > CO2_INTERVAL) {
    int val = mhz19.getCO2();
    if (val > 0) {
      co2Value = val;
      co2History[historyCount % GRAPH_MAX_POINTS] = co2Value;
      historyCount++;
      apiClientPushSample(co2Value, millis());
    }
    lastCO2Read = millis();

    // LED色を更新（CO2ページの時のみ）
    if (currentPage == 0) {
      CRGB ledColor;
      if (co2Value <= 500) {
        ledColor = CRGB(0, 255, 0);
      } else {
        int co2Stepped = constrain(((co2Value - 500) / 50) * 50 + 500, 500, 1200);
        uint8_t redVal   = (uint8_t)((co2Stepped - 500) / 700.0f * 255);
        uint8_t greenVal = (uint8_t)((1.0f - (co2Stepped - 500) / 700.0f) * 255);
        ledColor = CRGB(redVal, greenVal, 0);
      }
      fill_solid(leds, LED_COUNT, ledColor);
      FastLED.show();
    }
  }
}

void pageCO2Draw() {
  FastLED.setBrightness(15);
  uint16_t co2Color = TFT_GREEN;
  if (co2Value > 1500) co2Color = TFT_RED;
  else if (co2Value > 1000) co2Color = TFT_YELLOW;
  canvas.setTextColor(co2Color);
  canvas.setFont(&fonts::FreeSansBold24pt7b);
  canvas.setTextSize(1);
  {
    char buf[16];
    snprintf(buf, sizeof(buf), "%d ppm", co2Value);
    int textW = canvas.textWidth(buf);
    canvas.setCursor((screenW - textW) / 2, 8);
    canvas.print(buf);
  }
  canvas.setFont(&fonts::Font0);
  canvas.setTextColor(TFT_WHITE);
  drawGraph();
}
