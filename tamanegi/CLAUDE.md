# tamanegi

M5Stack Core2 向けのマルチページアプリケーション。CO2モニタリング機能付き。

## Tech Stack

- **Platform**: ESP32 (M5Stack Core2) / PlatformIO / Arduino Framework
- **Libraries**: M5Unified, MH-Z19 (CO2センサー), FastLED (SK6812 LED x10)

## Architecture

- ページベースのUI切り替え (`currentPage` + switch文)
- グローバル変数は `globals.h` で extern 宣言
- 各ページは `page_*.h` / `page_*.cpp` のペアで実装
- 描画は `M5Canvas` スプライトバッファ経由 (320x240)

## Pages

| Page | File | Button |
|------|------|--------|
| CO2グラフ | page_co2.cpp | BtnA (左) |
| Hello World 1 | page_hello1.cpp | BtnB (中) |
| Hello World 3 | page_hello3.cpp | BtnC (右) |

## Hardware

- LED: GPIO 25, SK6812 x 10
- CO2 Sensor: Serial2 (9600baud, RX=13, TX=14), MH-Z19
- Screen: 320x240

## Build & Upload

```bash
pio run -t upload        # ビルド＆書き込み
pio device monitor       # シリアルモニタ (115200)
```
