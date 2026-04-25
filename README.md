# tamanegi

M5Stack Core2 で部屋の CO2 濃度を測り、ブラウザで見られるようにする個人プロジェクト。

```
[ M5Stack Core2 + MH-Z19 ]  ──HTTP POST /api/ingest──▶  [ Next.js + PostgreSQL ]  ──▶  ブラウザ
        firmware                                              dashboard
```

## 構成

| ディレクトリ | 役割 |
|----|----|
|[m5-co2-monitor/](m5-co2-monitor/)|送信側ファームウェア（PlatformIO / Arduino / ESP32）|
|[dashboard-app/](dashboard-app/)|受信＋表示の Next.js アプリ（Prisma + PostgreSQL）|

各ディレクトリに README と CLAUDE.md があるので詳細はそちらへ。プロジェクト間の通信プロトコルは [CLAUDE.md](CLAUDE.md) にまとめている。
