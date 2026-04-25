#include "page_imu.h"
#include <math.h>

static float smoothH = 0, smoothS = 0;
static const float ALPHA = 0.15f; // 0に近いほど滑らか

void pageImuDraw() {
  M5.Imu.update();
  auto data = M5.Imu.getImuData();

  // 加速度（重力）ベクトルから姿勢を算出し、向きで色を決定
  float ax = data.accel.x, ay = data.accel.y, az = data.accel.z;
  float mag = sqrtf(ax * ax + ay * ay + az * az);
  if (mag < 0.01f) mag = 0.01f;
  float nx = ax / mag, ny = ay / mag, nz = az / mag;

  // 傾き方向 → 色相 (Hue 0-255)
  float hue_f = atan2f(ny, nx);  // -PI〜PI
  float targetH = (hue_f + (float)M_PI) / (2.0f * (float)M_PI) * 255.0f;

  // 傾き量 → 彩度 (水平=白っぽい、傾く=鮮やか)
  float tilt = sqrtf(nx * nx + ny * ny);  // 0(水平)〜1(横倒し)
  float targetS = fminf(tilt / 0.8f, 1.0f) * 225.0f + 30.0f;

  smoothH += (targetH - smoothH) * ALPHA;
  smoothS += (targetS - smoothS) * ALPHA;

  CHSV hsv((uint8_t)smoothH, (uint8_t)smoothS, 255);
  CRGB rgb;
  hsv2rgb_rainbow(hsv, rgb);

  FastLED.setBrightness(80);
  for (int i = 0; i < LED_COUNT; i++) {
    leds[i] = rgb;
  }
  FastLED.show();

  canvas.setFont(&fonts::FreeSansBold12pt7b);
  canvas.setTextColor(TFT_WHITE);
  canvas.setCursor(10, 30);
  canvas.print("IMU Orientation");

  canvas.setFont(&fonts::FreeSans9pt7b);

  // 現在のLED色をプレビュー表示
  canvas.fillRect(200, 10, 100, 40, canvas.color565(rgb.r, rgb.g, rgb.b));
  canvas.drawRect(200, 10, 100, 40, TFT_WHITE);

  // 加速度（姿勢）
  canvas.setTextColor(TFT_CYAN);
  canvas.setCursor(10, 70);
  canvas.print("Accel (g)");
  canvas.setTextColor(TFT_WHITE);
  canvas.setCursor(20, 95);
  canvas.printf("X: %+7.2f", data.accel.x);
  canvas.setCursor(20, 115);
  canvas.printf("Y: %+7.2f", data.accel.y);
  canvas.setCursor(20, 135);
  canvas.printf("Z: %+7.2f", data.accel.z);

  // 姿勢情報
  float pitch = atan2f(ax, az) * 180.0f / (float)M_PI;
  float roll  = atan2f(ay, az) * 180.0f / (float)M_PI;
  canvas.setTextColor(TFT_YELLOW);
  canvas.setCursor(10, 165);
  canvas.print("Orientation");
  canvas.setTextColor(TFT_WHITE);
  canvas.setCursor(20, 190);
  canvas.printf("Pitch: %+6.1f deg", pitch);
  canvas.setCursor(20, 210);
  canvas.printf("Roll:  %+6.1f deg", roll);
  canvas.setCursor(20, 230);
  canvas.printf("Tilt:  %5.1f%%", tilt * 100.0f);
}
