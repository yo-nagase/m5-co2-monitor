# m5-co2-monitor

M5Stack Core2 上で動くCO2モニターのファームウェアです。MH-Z19 で1秒ごとに CO2 濃度を測定し、本体画面にグラフ表示しつつ、Wi-Fi 経由で `dashboard-app` の Ingest API に送信します。

## 機能

- **CO2グラフ表示**: 直近60点をリアルタイム描画（400〜2000 ppm 表示、1000/1500 ppm に警告ライン）
- **CO2値ベースの色分け**: 緑（〜1000）/ 黄（〜1500）/ 赤（1500超）
- **Wi-Fi**: SmartConfig 対応（初回接続時 BtnB 長押しで開始、最後の SSID/PSK は NVS に保存）
- **送信バッファ**: 接続不能時は最大900サンプルをリングバッファに溜めて自動再送
- **3ページ切替**: BtnA = CO2グラフ / BtnB = IMU / BtnC = Wi-Fiステータス
- **デバイスID**: ESP32 efuse MAC 下位 24bit から `core2-XXXXXX` を自動生成

## ハードウェア

| 部品 | 接続 |
|------|------|
| MH-Z19 (CO2センサー) | Serial2 9600bps, RX=GPIO13, TX=GPIO14 |
| SK6812 LED ×10 | GPIO25 |
| 画面 | 320×240 (M5Stack Core2 内蔵) |

## ビルド & 書き込み

PlatformIO が必要です。

```bash
pio run -t upload      # ビルド＆書き込み
pio device monitor     # シリアルログ (115200baud)
```

## 設定: 送信先サーバ

`include/secrets.h` を作成し、ダッシュボードのURLとAPIキーを定義します（`secrets.h.example` をコピー）。

```c
#pragma once
#define API_BASE_URL "http://192.168.x.x:3000"
#define API_KEY      "dev-api-key-please-rotate"
```

- `API_BASE_URL` … `dashboard-app` を起動しているマシンの URL（末尾スラッシュなし）
- `API_KEY` … `dashboard-app/.env` の `INGEST_API_KEY` と同じ値
- 送信先パスは固定で `<API_BASE_URL>/api/ingest`

`secrets.h` は gitignored です。書き換えたら再ビルドして書き込みます。

## Wi-Fi の設定

初回起動時はWi-Fi未設定のため、BtnBを押して SmartConfig を起動し、スマホアプリ（EspTouch等）で SSID と PSK を送信します。設定は NVS に保存され、次回以降は自動接続します。

## ファイル構成

```
src/
├── main.cpp           setup/loop、ページ切り替え
├── globals.h          全ページ共通の extern 変数
├── page_co2.cpp/.h    CO2グラフページ
├── page_imu.cpp/.h    IMUページ
├── page_wifi.cpp/.h   Wi-Fiステータス／SmartConfig ページ
├── page_hello1.cpp/.h （未使用）
└── api_client.cpp/.h  Ingest API 送信＋リングバッファ
include/
├── secrets.h          API_BASE_URL / API_KEY（gitignored）
└── secrets.h.example  雛形
```

各ページは `page_*.h` / `page_*.cpp` のペアで実装され、描画は `M5Canvas` スプライトバッファ経由で行われます。

## 関連プロジェクト

- [`../dashboard-app`](../dashboard-app) — 受信側 Next.js ダッシュボード
