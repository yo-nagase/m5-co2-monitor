# tamanegi (m5-co2-monitor)

M5Stack Core2 上の CO2 モニターファームウェア。MH-Z19 で1秒ごとに測定し、画面表示しながら `dashboard-app` の `/api/ingest` に送信する。送受信プロトコルや送信パイプラインの詳細は親ディレクトリの [../CLAUDE.md](../CLAUDE.md) を参照。

## Tech Stack

- **Platform**: ESP32 (M5Stack Core2) / PlatformIO / Arduino
- **Libraries**: M5Unified, MH-Z19, FastLED, ArduinoJson, HTTPClient

## Pages

`currentPage` を BtnA/B/C で切り替える。`*_Update()` は常時走る（CO2測定・送信・LED・Wi-Fi管理は表示中のページに依存しない）が、`*_Draw()` はアクティブページのみ。

|Page|File|Trigger|
|----|----|-------|
|CO2 グラフ|page_co2.cpp|BtnA|
|IMU|page_imu.cpp|BtnB|
|Wi-Fi ステータス / SmartConfig|page_wifi.cpp|BtnC|

`page_hello1.cpp` はソースに残るが現在は未配線。

Wi-Fi ページ上の画面タッチが SmartConfig 開始トリガー（ハードウェアボタンではない）。EspTouch 等から SSID/PSK を送ると NVS に保存され、以後は自動接続。

## Hardware

- **CO2 Sensor**: MH-Z19 on Serial2, 9600 baud, RX=GPIO13 / TX=GPIO14, autoCalibration off
- **LED**: SK6812 ×10 on GPIO25 (FastLED, brightness=15)
- **Display**: 320×240、`M5Canvas` スプライトに描画してから `pushSprite(0,0)`

## Build & Upload

```bash
pio run -t upload        # ビルド＋書き込み
pio device monitor       # シリアルログ (115200)
```

書き込み前に `include/secrets.h` を作成（`secrets.h.example` が雛形）。`API_BASE_URL` / `API_KEY` の意味と `dashboard-app` 側との対応は [../CLAUDE.md](../CLAUDE.md) を参照。
