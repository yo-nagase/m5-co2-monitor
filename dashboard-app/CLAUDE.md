# tamanegi-dash (dashboard-app)

@AGENTS.md

CO2 受信ダッシュボード。`m5-co2-monitor` がPOSTする `/api/ingest` を受けてPostgreSQL に書き込み、`recharts` でグラフ表示する。**API送信プロトコル / device_id 形式 / DBスキーマ概要 / アラートパイプライン**は親ディレクトリの [../CLAUDE.md](../CLAUDE.md) を参照。

## DB セットアップ

PostgreSQL 固定。接続先は `DATABASE_URL` で切り替える（Next.js は `.env.local` > `.env` の優先で読むので、ローカルオーバライドは `.env.local` に書く）。選択肢は2つ：

- **ローカル Docker**: [docker-compose.yml](docker-compose.yml) で `m5postgres` コンテナ（Postgres 17、ホスト側ポート **5411**）を立てる。`docker compose up -d` → `npx prisma migrate dev`。`DATABASE_URL="postgresql://tamanegi:tamanegi@localhost:5411/tamanegi"`。
- **Prisma Postgres (managed)**: [console.prisma.io](https://console.prisma.io) で DB を作り、発行される `postgres://...@db.prisma.io:5432/postgres?sslmode=require` を `.env` に貼る。`npx prisma migrate deploy` でスキーマ適用。

Prisma 7 では `schema.prisma` の `datasource` ブロックに `url` を書かない（Prisma 7 で仕様変更）。接続URLはランタイムで [lib/db.ts](lib/db.ts) が `process.env.DATABASE_URL` を読んで `PrismaPg({ connectionString })` に渡し、マイグレーションは [prisma.config.ts](prisma.config.ts) が読む。

## 把握しておくべき "新しめ" の前提

- **Next.js 16** — 最上部の `@AGENTS.md` の警告どおり、ルーティング/データフェッチ/設定APIが訓練データと違う可能性がある。書く前に `node_modules/next/dist/docs/` を読むこと。
- **React 19 + React Compiler 有効** ([next.config.ts](next.config.ts) の `reactCompiler: true`)。再レンダ最適化はコンパイラが自動でやるので、`useMemo` / `useCallback` / `React.memo` を反射的に足さない。本当に必要な計測根拠があるときだけ。
- **Tailwind v4** — 設定ファイル無し。CSSは [app/globals.css](app/globals.css) で `@import "tailwindcss"` し、テーマは `@theme inline { ... }` で宣言。`tailwind.config.js` を作らない。
- **Server Components がデフォルト**。`"use client"` を明示しているのは現状 `components/*.tsx`（インタラクティブ／Recharts用）。データ取得は Server Component またはルートハンドラ側に置く（[app/page.tsx](app/page.tsx) は SC で `listDevices()` を直接呼んでいる）。
- **Server Actions**: 端末名編集は [app/actions/devices.ts](app/actions/devices.ts) のサーバアクション経由。`PATCH /api/devices/[deviceId]` は同じ更新ロジックの REST 版で、両方を変えるときは整合性を取る。

## ルート / API の規約

- 全ルートに `runtime = "nodejs"` と `dynamic = "force-dynamic"` を設定している。Edge ランタイムでは `pg` ドライバが動かないため、新規ルートでも `runtime` は外さない。
- `/api/ingest` は `X-API-Key` 必須・成功時 `204 No Content`。読み取り系（`/api/readings`, `/api/devices`）は現状キー無しで公開。

## アグリゲーション (グラフ用バケット)

[lib/aggregate.ts](lib/aggregate.ts) の `RANGE_CONFIG` でレンジごとに `bucketMs` を決め打ちしている（1h=10s / 6h=60s / 24h=5min / 7d=30min / 30d=2h、いずれも目安300〜360点）。レンジを増減するときは:

1. [lib/schemas.ts](lib/schemas.ts) の `RANGES` に追加
2. [lib/aggregate.ts](lib/aggregate.ts) の `RANGE_CONFIG` に対応するバケット幅
3. [components/RangeSelector.tsx](components/RangeSelector.tsx) のUIボタン

の3箇所を揃える。SQLは `aggregateReadings` ([lib/db.ts](lib/db.ts)) に1本化されているので、追加SQLは不要。

## タイムスタンプ

`Reading.recordedAt`, `Device.lastSeenAt`, `AlertState.lastFiredAt` は **`BigInt` ms-epoch**（Prisma スキーマ参照）。JSONレスポンスや UI で扱うときは `Number(r.recordedAt)` で number に落としている（[lib/db.ts](lib/db.ts) の各関数で実施済み）。`BigInt` のまま `JSON.stringify` するとランタイムエラーになるので注意。
